.PHONY: build clean serve

build:
	cd crates/playground-wasm && wasm-pack build --target web --out-dir ../../web/pkg

clean:
	rm -rf crates/playground-wasm/target web/pkg

serve: build
	cd web && npx -y serve -l 8080
