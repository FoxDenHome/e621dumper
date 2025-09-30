#!/usr/bin/env bash
HASH="$(nix run nixpkgs#prefetch-npm-deps package-lock.json)"
echo "New hash: $HASH"
sed "s~npmDepsHash = \".*\"~npmDepsHash = \"$HASH\"~g" -i flake.nix
