.PHONY: build clean serve

build: build-wasm build-editor

build-wasm:
	rustup target add wasm32-unknown-unknown
	which wasm-pack || cargo install wasm-pack
	cd crates/playground-wasm && wasm-pack build --target web --out-dir ../../web/pkg

build-editor:
	npx esbuild web/editor.js --bundle --format=esm --outfile=web/editor.bundle.js

clean:
	rm -rf crates/playground-wasm/target web/pkg web/editor.bundle.js

# Dev server with AI proxy. Set AI_API_BASE for generation feature:
#   AI_API_BASE=http://localhost:11434/v1 make serve
serve: build
	node server.mjs
