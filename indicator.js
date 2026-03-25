import GObject from 'gi://GObject';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as ModalDialog from 'resource:///org/gnome/shell/ui/modalDialog.js';

import {Phase} from './timer.js';

export const PotatoIndicator = GObject.registerClass(
    class PotatoIndicator extends PanelMenu.Button {
        _init(timer, settings, extensionPath, gettext) {
            super._init(0.0, 'Potato');
            this._timer = timer;
            this._settings = settings;
            this._ = gettext;

            this._blinkSourceId = null;
            this._blinkVisible = true;

            // Container
            this._box = new St.BoxLayout({
                style_class: 'panel-status-indicators-box',
            });
            this.add_child(this._box);

            // Icon
            const iconPath = GLib.build_filenamev([
                extensionPath,
                'icons',
                'tomato-symbolic.svg',
            ]);
            const gicon = Gio.icon_new_for_string(iconPath);
            this._icon = new St.Icon({
                gicon,
                style_class: 'system-status-icon',
                icon_size: 16,
            });
            this._box.add_child(this._icon);

            // Timer label (hidden when idle)
            this._label = new St.Label({
                text: '',
                y_align: Clutter.ActorAlign.CENTER,
                style: 'margin-left: 4px; font-variant-numeric: tabular-nums;',
                visible: false,
            });
            this._box.add_child(this._label);

            // Build popup menu
            this._buildMenu();

            // Connect signals
            this._timerSignals = [];
            this._connectTimer('tick', this._onTick.bind(this));
            this._connectTimer('phase-changed', this._onPhaseChanged.bind(this));

            // Settings changes
            this._settingsSignals = [];
            this._settingsSignals.push(
                this._settings.connect('changed::disable-skip', () =>
                    this._updateMenuVisibility()
                )
            );

            this._updateDisplay();
        }

        _connectTimer(signal, handler) {
            const id = this._timer.connect(signal, handler);
            this._timerSignals.push(id);
        }

        _buildMenu() {
            // Start
            this._startItem = new PopupMenu.PopupMenuItem(this._('Start'));
            this._startItem.connect('activate', () => this._timer.start());
            this.menu.addMenuItem(this._startItem);

            // Skip
            this._skipItem = new PopupMenu.PopupMenuItem(this._('Skip'));
            this._skipItem.connect('activate', () => this._timer.skip());
            this.menu.addMenuItem(this._skipItem);

            // Pause / Resume
            this._pauseItem = new PopupMenu.PopupMenuItem(this._('Pause'));
            this._pauseItem.connect('activate', () => {
                if (this._timer.isPaused)
                    this._timer.resume();
                else
                    this._timer.pause();
            });
            this.menu.addMenuItem(this._pauseItem);

            // Stop
            this._stopItem = new PopupMenu.PopupMenuItem(this._('Stop'));
            this._stopItem.connect('activate', () => this._showStopDialog());
            this.menu.addMenuItem(this._stopItem);

            // Separator
            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

            // Settings submenu
            this._settingsSubMenu = new PopupMenu.PopupSubMenuMenuItem(
                this._('Settings')
            );
            this.menu.addMenuItem(this._settingsSubMenu);

            // Work duration
            this._workDurationItem = this._createSpinnerItem(
                this._('Work time (min)'),
                'work-duration',
                1,
                120
            );
            this._settingsSubMenu.menu.addMenuItem(this._workDurationItem);

            // Rest duration
            this._restDurationItem = this._createSpinnerItem(
                this._('Rest time (min)'),
                'rest-duration',
                1,
                60
            );
            this._settingsSubMenu.menu.addMenuItem(this._restDurationItem);

            // Disable skip toggle
            this._disableSkipItem = new PopupMenu.PopupSwitchMenuItem(
                this._('Disable skip'),
                this._settings.get_boolean('disable-skip')
            );
            this._disableSkipItem.connect('toggled', (_item, state) => {
                this._settings.set_boolean('disable-skip', state);
            });
            this._settingsSubMenu.menu.addMenuItem(this._disableSkipItem);

            this._updateMenuVisibility();
        }

        _createSpinnerItem(label, settingsKey, min, max) {
            const item = new PopupMenu.PopupBaseMenuItem({reactive: false});

            const nameLabel = new St.Label({
                text: label,
                y_align: Clutter.ActorAlign.CENTER,
                x_expand: true,
            });
            item.add_child(nameLabel);

            const valueBox = new St.BoxLayout({style: 'spacing: 8px;'});

            const minusBtn = new St.Button({
                label: '−',
                style_class: 'button',
                style: 'padding: 2px 10px; min-width: 24px;',
            });

            const valueLabel = new St.Label({
                text: String(this._settings.get_uint(settingsKey)),
                y_align: Clutter.ActorAlign.CENTER,
                style: 'min-width: 30px; text-align: center;',
            });

            const plusBtn = new St.Button({
                label: '+',
                style_class: 'button',
                style: 'padding: 2px 10px; min-width: 24px;',
            });

            minusBtn.connect('clicked', () => {
                const val = Math.max(min, this._settings.get_uint(settingsKey) - 1);
                this._settings.set_uint(settingsKey, val);
                valueLabel.text = String(val);
            });

            plusBtn.connect('clicked', () => {
                const val = Math.min(max, this._settings.get_uint(settingsKey) + 1);
                this._settings.set_uint(settingsKey, val);
                valueLabel.text = String(val);
            });

            valueBox.add_child(minusBtn);
            valueBox.add_child(valueLabel);
            valueBox.add_child(plusBtn);
            item.add_child(valueBox);

            return item;
        }

        _showStopDialog() {
            const dialog = new ModalDialog.ModalDialog({
                destroyOnClose: true,
            });

            const label = new St.Label({
                text: this._('Stop the timer?'),
                style: 'font-size: 16px; padding: 12px 24px;',
            });
            dialog.contentLayout.add_child(label);

            dialog.addButton({
                label: this._('Cancel'),
                action: () => dialog.close(),
                key: Clutter.KEY_Escape,
            });
            dialog.addButton({
                label: this._('Stop'),
                action: () => {
                    this._timer.stop();
                    dialog.close();
                },
                isDefault: true,
            });

            dialog.open();
        }

        _updateMenuVisibility() {
            const isIdle = this._timer.phase === Phase.IDLE;
            const disableSkip = this._settings.get_boolean('disable-skip');

            this._startItem.visible = isIdle;
            this._skipItem.visible = !isIdle && !disableSkip;
            this._pauseItem.visible = !isIdle;
            this._stopItem.visible = !isIdle;
        }

        _onTick(_timer, _phase, _seconds) {
            this._updateDisplay();
        }

        _onPhaseChanged(_timer, phase) {
            this._updateDisplay();
            this._updateMenuVisibility();

            // Update pause label
            if (phase === Phase.PAUSED) {
                this._pauseItem.label.text = this._('Resume');
                this._startBlinking();
            } else {
                this._pauseItem.label.text = this._('Pause');
                this._stopBlinking();
            }
        }

        _updateDisplay() {
            const phase = this._timer.phase;

            if (phase === Phase.IDLE) {
                this._label.visible = false;
                this._label.style =
                    'margin-left: 4px; font-variant-numeric: tabular-nums;';
                return;
            }

            const seconds = this._timer.getRemainingSeconds();
            this._label.text = this._timer.formatTime(seconds);
            this._label.visible = true;

            if (phase === Phase.WORK_NEGATIVE || seconds < 0) {
                this._label.style =
                    'margin-left: 4px; font-variant-numeric: tabular-nums; color: #ff4444;';
            } else {
                this._label.style =
                    'margin-left: 4px; font-variant-numeric: tabular-nums;';
            }
        }

        _startBlinking() {
            this._stopBlinking();
            this._blinkVisible = true;
            this._blinkSourceId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 600, () => {
                this._blinkVisible = !this._blinkVisible;
                if (this._label)
                    this._label.opacity = this._blinkVisible ? 255 : 80;
                return GLib.SOURCE_CONTINUE;
            });
        }

        _stopBlinking() {
            if (this._blinkSourceId) {
                GLib.source_remove(this._blinkSourceId);
                this._blinkSourceId = null;
            }
            if (this._label)
                this._label.opacity = 255;
        }

        destroy() {
            this._stopBlinking();

            for (const id of this._timerSignals)
                this._timer.disconnect(id);
            this._timerSignals = [];

            for (const id of this._settingsSignals)
                this._settings.disconnect(id);
            this._settingsSignals = [];

            super.destroy();
        }
    }
);
