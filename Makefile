.PHONY: build clean serve

build: build-wasm build-editor

build-wasm:
	cd crates/playground-wasm && wasm-pack build --target web --out-dir ../../web/pkg

build-editor:
	npx esbuild web/editor.js --bundle --format=esm --outfile=web/editor.bundle.js

clean:
	rm -rf crates/playground-wasm/target web/pkg web/editor.bundle.js

serve: build
	cd web && npx -y serve -l 8080
