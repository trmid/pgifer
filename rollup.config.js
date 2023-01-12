import svelte from 'rollup-plugin-svelte';
import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import livereload from 'rollup-plugin-livereload';
import { terser } from 'rollup-plugin-terser';
import sveltePreprocess from 'svelte-preprocess';
import typescript from '@rollup/plugin-typescript';
import css from 'rollup-plugin-css-only';
import json from '@rollup/plugin-json';
import fs from 'fs';
import { join } from 'path';
import nodePackage from "./package.json";

// Determine production or development:
const production = !process.env.ROLLUP_WATCH;

// Output path:
const out = "docs";

function serve() {
	let server;

	function toExit() {
		if (server) server.kill(0);
	}

	return {
		writeBundle() {
			if (server) return;
			server = require('child_process').spawn('npm', ['run', 'start', '--', '--dev'], {
				stdio: ['ignore', 'inherit', 'inherit'],
				shell: true
			});

			process.on('SIGTERM', toExit);
			process.on('exit', toExit);
		}
	};
}

// Custom plugin to write service worker to out folder:
const generateSW = () => ({
	name: "Service Worker Generator",
	buildEnd: () => {

		// Helper function to read all files recursively in folder:
		const recursiveFiles = path => {
			const filenames = [];
			const children = fs.readdirSync(join(out, path));
			for(const child of children) {
				const childPath = join(path, child);
				if(fs.statSync(join(out, path, child)).isDirectory()) {
					filenames.push(...recursiveFiles(childPath));
				} else {
					filenames.push(childPath);
				}
			}
			return filenames;
		};
		
		// Read all files in out folder:
		const ignore = [
			'sw.js',
			'build/bundle.js.map',
			'CNAME',
			'example.gif',
			'banner.jpg'
		];
		const outFiles = new Set(["./", "build/bundle.js", "build/bundle.css", ...recursiveFiles("./")].map(filename => filename.replace(/\\/g, "/")).filter(file => !ignore.includes(file)));

		// Read sw-template:
		const template = fs.readFileSync("sw-template.js", { encoding: 'utf-8' });

		// Replace markers:
		let sw = template
			.replace(/\$PACKAGE\_VERSION/g, nodePackage.version)
			.replace(/\$FILES_TO_CACHE/g, JSON.stringify([...outFiles]));

		// Append ipfs.min.js contents to worker:
		sw += "\n\n" + fs.readFileSync("node_modules/ipfs-core/dist/index.min.js", { encoding: 'utf-8' });

		// Copy sw.js to out if file has changed:
		const swFilename = join(out, "sw.js");
		const stat = fs.statSync(swFilename);
		let writeFile = true;
		if(stat.isFile()) {
			const swContent = fs.readFileSync(swFilename, 'utf8');
			if(swContent === sw) writeFile = false;
		}
		if(writeFile) {
			fs.writeFileSync(swFilename, sw, { encoding: 'utf-8' });
			console.log('\x1b[32m%s\x1b[0m', `created ${out}/sw.js`);
		} else {
			console.log('\x1b[32m%s\x1b[0m', `no changes for ${out}/sw.js`);
		}

		// Done!
	}
});

export default {
	input: 'src/main.ts',
	output: {
		sourcemap: false && !production,
		format: 'iife',
		name: 'app',
		file: `${out}/build/bundle.js`,
	},
	plugins: [
		svelte({
			preprocess: sveltePreprocess({ sourceMap: !production }),
			compilerOptions: {
				// enable run-time checks when not in production
				dev: !production
			}
		}),
		// we'll extract any component CSS out into
		// a separate file - better for performance
		css({ output: 'bundle.css' }),
		json(),

		// If you have external dependencies installed from
		// npm, you'll most likely need these plugins. In
		// some cases you'll need additional configuration -
		// consult the documentation for details:
		// https://github.com/rollup/plugins/tree/master/packages/commonjs
		resolve({
			browser: true,
			dedupe: ['svelte'],
			preferBuiltins: false
		}),
		commonjs(),
		typescript({
			sourceMap: false && !production,
			inlineSources: false && !production,
		}),

		// In dev mode, call `npm run start` once
		// the bundle has been generated
		!production && serve(),

		// Watch the out directory and refresh the
		// browser on changes when not in production
		!production && livereload(out),

		// If we're building for production (npm run build
		// instead of npm run dev), minify
		production && terser(),

		// Write service worker to out folder
		generateSW(),
		
	],
	watch: {
		clearScreen: false
	}
};
