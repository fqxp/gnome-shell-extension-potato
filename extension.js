import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {TimerManager, Phase} from './timer.js';
import {StateManager} from './state.js';
import {createSoundPlayer} from './sounds.js';
import {FullscreenOverlay} from './overlay.js';
import {PotatoIndicator} from './indicator.js';

export default class PotatoExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._ = this.gettext.bind(this);

        this._stateManager = new StateManager();
        this._soundPlayer = createSoundPlayer(this.path);
        this._timer = new TimerManager(
            this._settings,
            this._stateManager,
            this._
        );
        this._overlay = new FullscreenOverlay(
            this._timer,
            this._soundPlayer,
            this._
        );
        this._indicator = new PotatoIndicator(
            this._timer,
            this._settings,
            this.path,
            this._
        );

        Main.panel.addToStatusArea(this.uuid, this._indicator);

        // Connect timer signals for sounds and overlay
        this._signals = [];
        this._connectSignal('work-ended', this._onWorkEnded.bind(this));
        this._connectSignal('rest-ended', this._onRestEnded.bind(this));
        this._connectSignal(
            'negative-reminder',
            this._onNegativeReminder.bind(this)
        );
        this._connectSignal(
            'rest-overtime-ping',
            this._onRestOvertimePing.bind(this)
        );
        this._connectSignal('phase-changed', this._onPhaseChanged.bind(this));

        // Restore state
        const saved = this._stateManager.load();
        if (saved)
            this._timer.restoreState(saved);
    }

    _connectSignal(name, handler) {
        const id = this._timer.connect(name, handler);
        this._signals.push(id);
    }

    _onWorkEnded() {
        this._soundPlayer.play('work-end');
        this._overlay.show('rest');
    }

    _onRestEnded() {
        // Rest countdown finished, show "Start working" button
        this._soundPlayer.play('rest-end');
        this._overlay.show('overtime');
    }

    _onNegativeReminder() {
        // Been working too long (5min negative), show rest overlay again
        this._soundPlayer.play('work-end');
        this._overlay.show('rest');
    }

    _onRestOvertimePing() {
        // User hasn't clicked "Start working" for 60s
        this._soundPlayer.play('rest-end');
    }

    _onPhaseChanged(_timer, phase) {
        // Hide overlay when entering work or idle
        if (phase === Phase.WORK || phase === Phase.IDLE) {
            if (this._overlay.visible)
                this._overlay.hide();
        }
    }

    disable() {
        for (const id of this._signals)
            this._timer.disconnect(id);
        this._signals = [];

        this._overlay?.destroy();
        this._overlay = null;

        this._indicator?.destroy();
        this._indicator = null;

        this._timer?.destroy();
        this._timer = null;

        this._stateManager = null;
        this._soundPlayer = null;
        this._settings = null;
    }
}
