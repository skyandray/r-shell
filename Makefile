# Makefile for R-Shell — a Tauri 2 (React 19 + Rust) desktop SSH client.
#
# Usage:
#   make                # Build the production binary (alias for `release`)
#   make install        # Install frontend deps
#   make dev            # Run the full desktop app with hot reload
#   make release        # Production build → src-tauri/target/release/r-shell
#   make check          # Type-check / compile-check without producing binaries
#   make test           # Run frontend + Rust unit tests
#   make lint           # Lint frontend + Rust
#   make clean          # Remove build artifacts
#   make run            # Launch the freshly built binary
#   make version-patch  # Bump patch version (1.2.3 → 1.2.4)
#
# Prerequisites (Linux): pnpm, Node ≥ 20, Rust (rustc/cargo), and Tauri's
# system deps — webkit2gtk-4.1, gtk+-3.0, librsvg-2.0, libsoup-3.0,
# javascriptcoregtk-4.1, ayatana-appindicator3-0.1.

SHELL := /bin/bash

# ── Toolchain discovery (use pnpm/npm and cargo from PATH) ──
PNPM    := $(shell command -v pnpm 2>/dev/null)
NPM     := $(shell command -v npm 2>/dev/null)
CARGO   := $(shell command -v cargo 2>/dev/null)

ifeq ($(PNPM),)
  ifeq ($(NPM),)
    $(error Neither pnpm nor npm was found in PATH. Install pnpm: `npm i -g pnpm`.)
  endif
  PKG := $(NPM)
  PKG_INSTALL := $(NPM) install
else
  PKG := $(PNPM)
  PKG_INSTALL := $(PNPM) install --frozen-lockfile
endif

ifeq ($(CARGO),)
  $(error cargo was not found in PATH. Install Rust via https://rustup.rs.)
endif

# ── Paths ──
ROOT        := $(CURDIR)
SRC_TAURI   := $(ROOT)/src-tauri
RELEASE_BIN := $(SRC_TAURI)/target/release/r-shell
BUNDLE_DIR  := $(SRC_TAURI)/target/release/bundle

# ── PHONY targets ──
.PHONY: all release dev install check test test-frontend test-rust \
        lint lint-frontend lint-rust lint-fix clean run version-patch \
        version-minor version-major help

# ── Default ──
all: release

# ── Install dependencies ──
install:
	@echo ">> Installing frontend dependencies ($(PKG))"
	cd $(ROOT) && $(PKG_INSTALL)
	@echo ">> Fetching Rust crates"
	cd $(SRC_TAURI) && $(CARGO) fetch

# ── Development: hot-reload desktop app ──
dev: node_modules
	@echo ">> Starting Tauri dev (hot reload)"
	cd $(ROOT) && $(PKG) tauri dev

# ── Production build: frontend + Rust release + installers ──
release: node_modules
	@echo ">> Building production binary and bundles"
	cd $(ROOT) && $(PKG) tauri build
	@echo ""
	@echo "✓ Build complete."
	@echo "  Binary:   $(RELEASE_BIN)"
	@echo "  Bundles:  $(BUNDLE_DIR)/{{deb,rpm,appimage}/}"

# ── Type-check / compile-check only (no binaries) ──
check: check-frontend check-rust

check-frontend: node_modules
	@echo ">> Type-checking frontend (tsc, noEmit)"
	cd $(ROOT) && $(PKG) exec tsc --noEmit

check-rust:
	@echo ">> Cargo check (Rust compile-only)"
	cd $(SRC_TAURI) && $(CARGO) check

# ── Tests ──
test: test-frontend test-rust

test-frontend: node_modules
	@echo ">> Running frontend unit tests (Vitest)"
	cd $(ROOT) && $(PKG) test

test-rust:
	@echo ">> Running Rust unit tests"
	cd $(SRC_TAURI) && $(CARGO) test --lib

# ── Lint ──
lint: lint-frontend lint-rust

lint-frontend: node_modules
	@echo ">> Linting frontend (ESLint)"
	cd $(ROOT) && $(PKG) lint

lint-rust:
	@echo ">> Linting Rust (clippy)"
	cd $(SRC_TAURI) && $(CARGO) clippy --all-targets -- -D warnings

lint-fix: node_modules
	@echo ">> Auto-fixing frontend lint issues"
	cd $(ROOT) && $(PKG) lint:fix

# ── Run the freshly built binary ──
run: $(RELEASE_BIN)
	@echo ">> Launching $(RELEASE_BIN)"
	$(RELEASE_BIN)

# ── Version bumping (updates package.json, Cargo.toml, tauri.conf.json, …) ──
version-patch:
	cd $(ROOT) && $(PKG) run version:patch

version-minor:
	cd $(ROOT) && $(PKG) run version:minor

version-major:
	cd $(ROOT) && $(PKG) run version:major

# ── Clean ──
clean:
	@echo ">> Removing frontend build output (dist/)"
	rm -rf $(ROOT)/dist
	@echo ">> Removing Rust target (src-tauri/target)"
	cd $(SRC_TAURI) && $(CARGO) clean

# ── Convenience: ensure node_modules exist before frontend work ──
node_modules:
	@if [ ! -d $(ROOT)/node_modules ]; then \
		echo ">> node_modules missing — running $(PKG_INSTALL)"; \
		cd $(ROOT) && $(PKG_INSTALL); \
	fi

# ── Help ──
help:
	@echo "R-Shell Makefile targets:"
	@echo ""
	@echo "  make              Build the production binary (alias for release)"
	@echo "  make install      Install frontend deps + fetch Rust crates"
	@echo "  make dev          Run desktop app with hot reload"
	@echo "  make release      Production build → binary + .deb/.rpm/.AppImage"
	@echo "  make check        Type-check frontend + cargo check (no binaries)"
	@echo "  make test         Run frontend (Vitest) + Rust (cargo test) unit tests"
	@echo "  make lint         Lint frontend (ESLint) + Rust (clippy)"
	@echo "  make lint-fix     Auto-fix frontend lint issues"
	@echo "  make run          Launch the freshly built binary"
	@echo "  make clean        Remove dist/ and src-tauri/target/"
	@echo "  make version-patch  Bump patch version"
	@echo "  make version-minor  Bump minor version"
	@echo "  make version-major  Bump major version"
	@echo ""
	@echo "Tools: $(PKG) + cargo"
	@echo "Output: $(RELEASE_BIN)"
