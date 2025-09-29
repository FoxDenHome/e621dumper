{
  inputs = {
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };
      in
      {
        packages = {
          default = pkgs.buildNpmPackage {
            pname = "e621dumper";
            version = "1.0.0";
            src = ./.;
            npmDepsHash = "sha256-2taqEt2KCfCmTQ80M3sVMdEgTeDjvvchwzEgRZJ9h/w=";
          };
        };
      });
}