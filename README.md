# Potato

A Pomodoro timer GNOME Shell extension. Shows a tomato in the top bar — click to start a 25-minute work timer. Alternates between work and rest phases with fullscreen overlay reminders.

## Features

- 25 min work / 5 min rest cycle (configurable)
- Fullscreen overlay on rest with keypress dismissal (5 keys to keep working)
- Overtime tracking with cumulative negative timer (red)
- Pause, skip, stop controls in the panel menu
- State persisted to disk — survives reboots
- i18n via gettext

## Install

```sh
make install
```

On Wayland, log out/in to pick up the new extension, then:

```sh
gnome-extensions enable potato@fqxp.de
```

## Development

Reinstall after changes:

```sh
make install
```

On Wayland there's no hot reload — you need to log out/in. For faster iteration, use a nested session:

```sh
MUTTER_DEBUG_DUMMY_MODE_SPECS="1600x900@60.0" dbus-run-session -- gnome-shell --nested --wayland
```

Check logs:

```sh
journalctl -f -o cat /usr/bin/gnome-shell
```

## Other targets

```sh
make pot        # Regenerate gettext template
make zip        # Build distributable zip
make uninstall  # Remove from ~/.local/share/gnome-shell/extensions
make clean      # Remove build artifacts
```

## Settings

Stored in GSettings (`org.gnome.shell.extensions.potato`). Also editable from the panel menu.

| Key             | Type | Default | Description           |
| --------------- | ---- | ------- | --------------------- |
| `work-duration` | uint | 25      | Work phase in minutes |
| `rest-duration` | uint | 5       | Rest phase in minutes |
| `disable-skip`  | bool | false   | Hide the Skip button  |

## State

Persisted to `~/.local/share/potato/state.json` on every state change. Tracks current phase, phase count, timer targets, and negative timer offset.
