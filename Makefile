UUID = potato@fqxp.de
INSTALL_DIR = $(HOME)/.local/share/gnome-shell/extensions/$(UUID)
SCHEMA_DIR = $(INSTALL_DIR)/schemas

SOURCES = extension.js indicator.js overlay.js timer.js state.js sounds.js metadata.json
SCHEMA = schemas/org.gnome.shell.extensions.potato.gschema.xml

.PHONY: all install uninstall schemas clean pot

all: schemas

schemas:
	glib-compile-schemas schemas/

install: schemas
	mkdir -p $(INSTALL_DIR)/schemas $(INSTALL_DIR)/icons $(INSTALL_DIR)/sounds $(INSTALL_DIR)/locale
	cp $(SOURCES) $(INSTALL_DIR)/
	cp $(SCHEMA) $(INSTALL_DIR)/schemas/
	cp schemas/gschemas.compiled $(INSTALL_DIR)/schemas/
	cp icons/tomato-symbolic.svg $(INSTALL_DIR)/icons/
	cp sounds/*.ogg $(INSTALL_DIR)/sounds/
	@if ls locale/* >/dev/null 2>&1; then cp -r locale/* $(INSTALL_DIR)/locale/; fi
	@echo "Installed to $(INSTALL_DIR)"
	@echo "Restart GNOME Shell (Alt+F2 → r) or log out/in to activate."

uninstall:
	rm -rf $(INSTALL_DIR)

pot:
	xgettext --from-code=UTF-8 --output=po/potato.pot \
		--keyword=_ --keyword=N_ \
		extension.js indicator.js overlay.js timer.js

clean:
	rm -f schemas/gschemas.compiled
	rm -rf locale

zip: schemas
	mkdir -p _build
	cp $(SOURCES) _build/
	cp -r schemas icons sounds _build/
	@if [ -d locale ]; then cp -r locale _build/; fi
	cd _build && zip -r ../$(UUID).zip . && cd ..
	rm -rf _build
	@echo "Created $(UUID).zip"
