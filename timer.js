import GLib from 'gi://GLib';
import GObject from 'gi://GObject';

export const Phase = {
    IDLE: 'IDLE',
    WORK: 'WORK',
    REST: 'REST',
    WORK_NEGATIVE: 'WORK_NEGATIVE',
    PAUSED: 'PAUSED',
};

// Sub-states for REST phase
export const RestSubState = {
    COUNTING_DOWN: 'COUNTING_DOWN',
    OVERTIME: 'OVERTIME',  // countdown hit 0, showing "Start working" button
};

export const TimerManager = GObject.registerClass({
    Signals: {
        'tick': {param_types: [GObject.TYPE_STRING, GObject.TYPE_INT]}, // phase, seconds
        'phase-changed': {param_types: [GObject.TYPE_STRING]},
        'work-ended': {},        // play sound, show overlay
        'rest-ended': {},        // play sound, show "start working" button
        'negative-reminder': {}, // play sound, re-show overlay after 5min negative
        'rest-overtime-ping': {},// repeat sound every 60s in rest overtime
    },
}, class TimerManager extends GObject.Object {
    _init(settings, stateManager, gettext) {
        super._init();
        this._settings = settings;
        this._stateManager = stateManager;
        this._ = gettext;

        this._phase = Phase.IDLE;
        this._restSubState = RestSubState.COUNTING_DOWN;
        this._phaseCount = 0;
        this._tickSourceId = null;

        // Wall-clock target for current countdown
        this._targetEndTime = 0;  // GLib.get_real_time() in microseconds
        // For pause
        this._pauseRemaining = 0; // seconds remaining when paused
        this._pausedPhase = Phase.IDLE;
        // For negative timer
        this._negativeStartTime = 0; // when negative counting started
        // For rest overtime pings
        this._lastOvertimePing = 0;
        // For work_negative 5-min reminders
        this._lastNegativeReminder = 0;
    }

    get phase() {
        return this._phase;
    }

    get restSubState() {
        return this._restSubState;
    }

    get phaseCount() {
        return this._phaseCount;
    }

    get isPaused() {
        return this._phase === Phase.PAUSED;
    }

    get workDuration() {
        return this._settings.get_uint('work-duration') * 60;
    }

    get restDuration() {
        return this._settings.get_uint('rest-duration') * 60;
    }

    _nowMicro() {
        return GLib.get_real_time();
    }

    _nowSec() {
        return Math.floor(this._nowMicro() / 1000000);
    }

    /**
     * Returns remaining seconds (positive for countdown, negative for overtime).
     */
    getRemainingSeconds() {
        if (this._phase === Phase.IDLE)
            return 0;
        if (this._phase === Phase.PAUSED)
            return this._pauseRemaining;
        if (this._phase === Phase.WORK_NEGATIVE || this._restSubState === RestSubState.OVERTIME) {
            // Negative: seconds since negativeStartTime
            const elapsed = this._nowSec() - this._negativeStartTime;
            return -elapsed;
        }
        // Countdown phases
        const remaining = Math.floor((this._targetEndTime - this._nowMicro()) / 1000000);
        return Math.max(remaining, 0);
    }

    /**
     * Format seconds as MM:SS or -MM:SS
     */
    formatTime(seconds) {
        if (seconds === undefined || seconds === null)
            seconds = this.getRemainingSeconds();
        const negative = seconds < 0;
        const abs = Math.abs(seconds);
        const m = Math.floor(abs / 60);
        const s = abs % 60;
        const str = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        return negative ? `-${str}` : str;
    }

    start() {
        if (this._phase !== Phase.IDLE)
            return;
        this._startWork();
    }

    _startWork() {
        this._phase = Phase.WORK;
        this._restSubState = RestSubState.COUNTING_DOWN;
        this._targetEndTime = this._nowMicro() + this.workDuration * 1000000;
        this._negativeStartTime = 0;
        this._phaseCount++;
        this._startTicking();
        this._saveState();
        this.emit('phase-changed', this._phase);
    }

    _startRest() {
        this._phase = Phase.REST;
        this._restSubState = RestSubState.COUNTING_DOWN;
        this._targetEndTime = this._nowMicro() + this.restDuration * 1000000;
        this._negativeStartTime = 0;
        this._lastOvertimePing = 0;
        this._phaseCount++;
        this._startTicking();
        this._saveState();
        this.emit('phase-changed', this._phase);
    }

    _enterRestOvertime() {
        this._restSubState = RestSubState.OVERTIME;
        this._negativeStartTime = this._nowSec();
        this._lastOvertimePing = this._nowSec();
        this._saveState();
        this.emit('rest-ended');
    }

    _enterWorkNegative() {
        // Called when user dismisses rest overlay with keypresses
        this._phase = Phase.WORK_NEGATIVE;
        // First time: start the negative clock. Subsequent times: keep cumulative.
        if (this._negativeStartTime === 0)
            this._negativeStartTime = this._nowSec();
        this._lastNegativeReminder = this._nowSec();
        // Don't reset _negativeStartTime — it's cumulative across dismissals
        this._startTicking();
        this._saveState();
        this.emit('phase-changed', this._phase);
    }

    dismissRestOverlay() {
        // User pressed 5 keys during REST countdown
        if (this._phase === Phase.REST && this._restSubState === RestSubState.COUNTING_DOWN)
            this._enterWorkNegative();
    }

    startWorkFromRest() {
        // User clicked "Start working" button in rest overtime
        if (this._phase === Phase.REST && this._restSubState === RestSubState.OVERTIME) {
            this._negativeStartTime = 0;
            this._startWork();
        }
    }

    skip() {
        if (this._settings.get_boolean('disable-skip'))
            return;

        switch (this._phase) {
        case Phase.WORK:
            this._stopTicking();
            this._startRest();
            this.emit('work-ended');
            break;
        case Phase.REST:
            this._stopTicking();
            this._startWork();
            break;
        case Phase.WORK_NEGATIVE:
            this._stopTicking();
            this._negativeStartTime = 0;
            this._startRest();
            this.emit('work-ended');
            break;
        case Phase.PAUSED:
            this._skipPaused();
            break;
        }
    }

    _skipPaused() {
        switch (this._pausedPhase) {
        case Phase.WORK:
            this._startRest();
            this.emit('work-ended');
            break;
        case Phase.REST:
            this._startWork();
            break;
        case Phase.WORK_NEGATIVE:
            this._negativeStartTime = 0;
            this._startRest();
            this.emit('work-ended');
            break;
        }
    }

    pause() {
        if (this._phase === Phase.PAUSED || this._phase === Phase.IDLE)
            return;

        this._pauseRemaining = this.getRemainingSeconds();
        this._pausedPhase = this._phase;
        this._phase = Phase.PAUSED;
        this._stopTicking();
        this._saveState();
        this.emit('phase-changed', this._phase);
    }

    resume() {
        if (this._phase !== Phase.PAUSED)
            return;

        this._phase = this._pausedPhase;

        if (this._phase === Phase.WORK_NEGATIVE) {
            // Adjust negativeStartTime to account for pause duration
            // pauseRemaining is negative for negative timer
            this._negativeStartTime = this._nowSec() + this._pauseRemaining;
        } else if (this._phase === Phase.REST && this._restSubState === RestSubState.OVERTIME) {
            this._negativeStartTime = this._nowSec() + this._pauseRemaining;
            this._lastOvertimePing = this._nowSec();
        } else {
            // Restore countdown from remaining seconds
            this._targetEndTime = this._nowMicro() + this._pauseRemaining * 1000000;
        }

        this._startTicking();
        this._saveState();
        this.emit('phase-changed', this._phase);
    }

    stop() {
        this._stopTicking();
        this._phase = Phase.IDLE;
        this._restSubState = RestSubState.COUNTING_DOWN;
        this._phaseCount = 0;
        this._targetEndTime = 0;
        this._pauseRemaining = 0;
        this._negativeStartTime = 0;
        this._saveState();
        this.emit('phase-changed', this._phase);
    }

    _startTicking() {
        this._stopTicking();
        this._tickSourceId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
            this._onTick();
            return GLib.SOURCE_CONTINUE;
        });
    }

    _stopTicking() {
        if (this._tickSourceId) {
            GLib.source_remove(this._tickSourceId);
            this._tickSourceId = null;
        }
    }

    _onTick() {
        const remaining = this.getRemainingSeconds();
        this.emit('tick', this._phase, remaining);

        if (this._phase === Phase.WORK && remaining <= 0) {
            this._stopTicking();
            this._startRest();
            this.emit('work-ended');
            return;
        }

        if (this._phase === Phase.REST) {
            if (this._restSubState === RestSubState.COUNTING_DOWN && remaining <= 0) {
                this._enterRestOvertime();
                return;
            }
            if (this._restSubState === RestSubState.OVERTIME) {
                // Ping every 60 seconds
                const elapsed = this._nowSec() - this._lastOvertimePing;
                if (elapsed >= 60) {
                    this._lastOvertimePing = this._nowSec();
                    this.emit('rest-overtime-ping');
                }
            }
        }

        if (this._phase === Phase.WORK_NEGATIVE) {
            // Reminder every 5 minutes (rest duration)
            const elapsed = this._nowSec() - this._lastNegativeReminder;
            if (elapsed >= this.restDuration) {
                // Transition to REST with a fresh countdown, but preserve negative start time
                const savedNegStart = this._negativeStartTime;
                this._stopTicking();
                this._phase = Phase.REST;
                this._restSubState = RestSubState.COUNTING_DOWN;
                this._targetEndTime = this._nowMicro() + this.restDuration * 1000000;
                this._negativeStartTime = savedNegStart; // keep cumulative negative
                this._lastOvertimePing = 0;
                this._phaseCount++;
                this._startTicking();
                this._saveState();
                this.emit('negative-reminder');
                this.emit('phase-changed', this._phase);
            }
        }
    }

    _saveState() {
        this._stateManager?.save({
            phase: this._phase,
            restSubState: this._restSubState,
            phaseCount: this._phaseCount,
            targetEndTime: this._targetEndTime,
            pauseRemaining: this._pauseRemaining,
            pausedPhase: this._pausedPhase,
            negativeStartTime: this._negativeStartTime,
        });
    }

    restoreState(data) {
        if (!data || data.phase === Phase.IDLE)
            return false;

        this._phaseCount = data.phaseCount || 0;
        this._negativeStartTime = data.negativeStartTime || 0;
        this._restSubState = data.restSubState || RestSubState.COUNTING_DOWN;

        if (data.phase === Phase.PAUSED) {
            this._phase = Phase.PAUSED;
            this._pauseRemaining = data.pauseRemaining || 0;
            this._pausedPhase = data.pausedPhase || Phase.WORK;
            this.emit('phase-changed', this._phase);
            return true;
        }

        this._phase = data.phase;
        this._targetEndTime = data.targetEndTime || 0;

        // Check if countdown has expired while we were away
        if (this._phase === Phase.WORK) {
            const remaining = Math.floor((this._targetEndTime - this._nowMicro()) / 1000000);
            if (remaining <= 0) {
                // Work ended while away, go to rest
                this._startRest();
                this.emit('work-ended');
                return true;
            }
        } else if (this._phase === Phase.REST && this._restSubState === RestSubState.COUNTING_DOWN) {
            const remaining = Math.floor((this._targetEndTime - this._nowMicro()) / 1000000);
            if (remaining <= 0) {
                // Rest countdown ended while away
                this._negativeStartTime = Math.floor(this._targetEndTime / 1000000);
                this._enterRestOvertime();
                this._startTicking();
                return true;
            }
        }

        this._startTicking();
        this.emit('phase-changed', this._phase);
        return true;
    }

    destroy() {
        this._stopTicking();
    }
});
