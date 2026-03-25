import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Meta from 'gi://Meta';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {Phase, RestSubState} from './timer.js';

export class FullscreenOverlay {
    constructor(timer, soundPlayer, gettext) {
        this._timer = timer;
        this._soundPlayer = soundPlayer;
        this._ = gettext;

        this._actor = null;
        this._keyPressCount = 0;
        this._requiredKeyPresses = 5;
        this._tickSignalId = null;
        this._grab = null;

        // Labels we update
        this._messageLabel = null;
        this._timerLabel = null;
        this._keypressLabel = null;
        this._startWorkingButton = null;
    }

    show(mode) {
        // mode: 'rest' (countdown) or 'overtime' (button shown)
        if (this._actor) {
            this._updateForMode(mode);
            return;
        }

        this._keyPressCount = 0;

        this._actor = new St.Widget({
            reactive: true,
            style_class: 'potato-overlay',
            layout_manager: new Clutter.BinLayout(),
            x_expand: true,
            y_expand: true,
        });

        // Cover all monitors
        const monitor = Main.layoutManager.primaryMonitor;
        this._actor.set_position(monitor.x, monitor.y);
        this._actor.set_size(monitor.width, monitor.height);

        // Semi-transparent dark background
        this._actor.style = `
            background-color: rgba(30, 30, 30, 0.95);
        `;

        // Container box
        const box = new St.BoxLayout({
            vertical: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
            y_expand: true,
            style: 'spacing: 24px;',
        });

        // Tomato emoji (large)
        const tomatoLabel = new St.Label({
            text: '\u{1F345}',
            x_align: Clutter.ActorAlign.CENTER,
            style: 'font-size: 96px;',
        });
        box.add_child(tomatoLabel);

        // Message
        this._messageLabel = new St.Label({
            text: this._('Have a rest!'),
            x_align: Clutter.ActorAlign.CENTER,
            style: 'font-size: 48px; font-weight: bold; color: white;',
        });
        box.add_child(this._messageLabel);

        // Timer
        this._timerLabel = new St.Label({
            text: '05:00',
            x_align: Clutter.ActorAlign.CENTER,
            style:
                'font-size: 72px; font-weight: bold; color: white; font-variant-numeric: tabular-nums;',
        });
        box.add_child(this._timerLabel);

        // Keypress hint
        this._keypressLabel = new St.Label({
            text: '',
            x_align: Clutter.ActorAlign.CENTER,
            style: 'font-size: 20px; color: rgba(255,255,255,0.6);',
        });
        box.add_child(this._keypressLabel);

        // Start working button (hidden initially during countdown)
        this._startWorkingButton = new St.Button({
            label: this._('Start working'),
            x_align: Clutter.ActorAlign.CENTER,
            style_class: 'potato-start-button',
            style: `
                font-size: 24px;
                padding: 16px 48px;
                background-color: rgba(200, 60, 60, 0.9);
                color: white;
                border-radius: 12px;
                font-weight: bold;
            `,
            visible: false,
        });
        this._startWorkingButton.connect('clicked', () => {
            this._timer.startWorkFromRest();
            this.hide();
        });
        box.add_child(this._startWorkingButton);

        this._actor.add_child(box);

        // Key capture
        this._keyPressId = this._actor.connect(
            'key-press-event',
            (_actor, event) => {
                return this._onKeyPress(event);
            }
        );

        // Add to chrome above everything
        Main.layoutManager.addTopChrome(this._actor);

        this._updateForMode(mode);
        this._updateTimerDisplay();
        this._connectTimerTick();

        // Grab keyboard (may fail if another grab is active, e.g. popup menu)
        try {
            this._grab = Main.pushModal(this._actor, {
                actionMode: Meta.ActionMode.NORMAL,
            });
        } catch {
            this._grab = null;
        }
    }

    _updateForMode(mode) {
        if (!this._actor)
            return;

        if (mode === 'overtime') {
            this._messageLabel.text = this._('Time to work!');
            this._startWorkingButton.visible = true;
            this._keypressLabel.visible = false;
            this._keyPressCount = 0;
        } else {
            this._messageLabel.text = this._('Have a rest!');
            this._startWorkingButton.visible = false;
            this._keypressLabel.visible = true;
            this._keyPressCount = 0;
            this._updateKeypressLabel();
        }
    }

    _onKeyPress(_event) {
        // Only count keypresses during rest countdown (not overtime)
        if (
            this._timer.phase !== Phase.REST ||
            this._timer.restSubState !== RestSubState.COUNTING_DOWN
        )
            return Clutter.EVENT_PROPAGATE;

        this._keyPressCount++;
        this._updateKeypressLabel();

        if (this._keyPressCount >= this._requiredKeyPresses) {
            this._timer.dismissRestOverlay();
            this.hide();
        }

        return Clutter.EVENT_STOP;
    }

    _updateKeypressLabel() {
        if (!this._keypressLabel)
            return;
        const remaining = this._requiredKeyPresses - this._keyPressCount;
        if (remaining > 0) {
            this._keypressLabel.text = this._(
                '%d more keypresses to continue working'
            ).replace('%d', remaining);
        } else {
            this._keypressLabel.text = '';
        }
    }

    _connectTimerTick() {
        this._disconnectTimerTick();
        this._tickSignalId = this._timer.connect('tick', () => {
            this._updateTimerDisplay();
        });
    }

    _disconnectTimerTick() {
        if (this._tickSignalId) {
            this._timer.disconnect(this._tickSignalId);
            this._tickSignalId = null;
        }
    }

    _updateTimerDisplay() {
        if (!this._timerLabel)
            return;

        const seconds = this._timer.getRemainingSeconds();
        this._timerLabel.text = this._timer.formatTime(seconds);

        if (seconds < 0) {
            this._timerLabel.style =
                'font-size: 72px; font-weight: bold; color: #ff4444; font-variant-numeric: tabular-nums;';
        } else {
            this._timerLabel.style =
                'font-size: 72px; font-weight: bold; color: white; font-variant-numeric: tabular-nums;';
        }
    }

    hide() {
        this._disconnectTimerTick();

        if (this._grab) {
            Main.popModal(this._grab);
            this._grab = null;
        }

        if (this._actor) {
            if (this._keyPressId) {
                this._actor.disconnect(this._keyPressId);
                this._keyPressId = null;
            }
            Main.layoutManager.removeChrome(this._actor);
            this._actor.destroy();
            this._actor = null;
        }

        this._messageLabel = null;
        this._timerLabel = null;
        this._keypressLabel = null;
        this._startWorkingButton = null;
    }

    get visible() {
        return this._actor !== null;
    }

    destroy() {
        this.hide();
    }
}
