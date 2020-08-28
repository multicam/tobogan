const chalk = require('chalk'), chokidar = require('chokidar'), promise = require('bluebird'), sass = require('node-sass'), path_ = require('path'), fs = require('fs')

const log = console.log, serialize = JSON.stringify, deserialize = JSON.parse, keysOf = Object.keys

const
	rewrites = [
		'/courses',
		'/student-work'
	]

const proxy_patchy = () => (req, res, next) => {
	if( rewrites.includes(req.url) ) {
		req.url += '.html'
	}

	console.log('==',chalk.grey.italic(req.url))
	next()
}

module.exports = eleventyConfig => {

	const MarkdownIt = require("markdown-it");
	const mdRender = new MarkdownIt();

	eleventyConfig.addJavaScriptFunction('getContext', function(name) {
		return (name) ? this.ctx[name] : this.ctx;
	})

	eleventyConfig.addFilter("renderUsingMarkdown", function(rawString) {
		return mdRender.render(rawString);
	});

	eleventyConfig.addFilter('custom_dump', obj => {

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

	// sass_install('style/')

  eleventyConfig.addPassthroughCopy('img');
	eleventyConfig.addPassthroughCopy('images');
  eleventyConfig.addPassthroughCopy('js/components');
	eleventyConfig.addPassthroughCopy('style/*.css');


	eleventyConfig.addPassthroughCopy('favicon.ico')
	eleventyConfig.addPassthroughCopy('site.webmanifest')

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

  // You can return your Config object (optional).

  return {
    templateFormats: [
      'html',
      'md',
      'njk'
    ],
    passthroughFileCopy: true,
  }
}
