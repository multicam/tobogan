const chalk = require('chalk'), chokidar = require('chokidar'), promise = require('bluebird'), sass = require('node-sass'), path_ = require('path'), fs = require('fs'), {defaults} = require('lodash')

const log = console.log, serialize = JSON.stringify, deserialize = JSON.parse, keysOf = Object.keys

const
	rewrites = [
		'/courses',
		'/student-work'
	]

const proxy_patchy = () => (req, res, next) => {
	if( rewrites.includes(req.url) ) {
		req.url += '/'
	}

	console.log('==',chalk.grey.italic(req.url))
	next()
}

module.exports = eleventyConfig => {

	eleventyConfig.setLiquidOptions({
		dynamicPartials: true
	});

	// -- filter

	const MarkdownIt = require("markdown-it");
	const mdRender = new MarkdownIt();

	eleventyConfig.addFilter("renderUsingMarkdown", function(rawString) {
		return mdRender.render(rawString);
	});

	// --

	eleventyConfig.addFilter('c_dump', obj => {

		const getCircularReplacer = () => {
			const seen = new WeakSet();
			return (key, value) => {
				if (typeof value === "object" && value !== null) {
					if (seen.has(value)) {
						return;
					}
					seen.add(value);
				}
				return value;
			};
		};

		return JSON.stringify(obj, getCircularReplacer(), 2);
	});

	// -- shortcodes

	eleventyConfig.addShortcode('getContext', function(name) {
		return (name) ? this.ctx[name] : this.ctx;
	})

	// --

	eleventyConfig.addShortcode( "fallback", (triedValue,fallbackValue) => triedValue ? triedValue : fallbackValue ? fallbackValue : '' )

	// -- pass-through

  eleventyConfig.addPassthroughCopy('img');
	eleventyConfig.addPassthroughCopy('images');
  eleventyConfig.addPassthroughCopy('js/components');
	eleventyConfig.addPassthroughCopy('style/*.css');


	eleventyConfig.addPassthroughCopy('favicon.ico')
	eleventyConfig.addPassthroughCopy('site.webmanifest')

	// -- browsersync

	eleventyConfig.setBrowserSyncConfig({
		notify: true,
		callbacks: {
			ready: (err,bs) => {
				err && console.log(err)
				log('BrowserSync config', bs.config)
			}
		},
		middleware: [ proxy_patchy() ]
	});

  // you can return your config object (optional).
	eleventyConfig.addPairedShortcode("postcss", async code => {
		const rawFilepath = path.join(__dirname, `../src/_includes/entry.css`);
		new promise( (resolve,reject) => {
			postcss([
				require("precss"),
				require("postcss-import"),
				require("postcss-custom-selectors"),
				require("autoprefixer"),
				require("cssnano")
			])
				.process(code, { from: rawFilepath })
				.then(result => result.css);
		})
	})

	return {
		dir: {
			input: "src",
			output: "www"
		},
		passthroughFileCopy: true

  }
}
