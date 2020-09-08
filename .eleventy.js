const chalk = require('chalk'), chokidar = require('chokidar'), promise = require('bluebird'), sass = require('node-sass'), path_ = require('path'), fs = require('fs'), {defaults} = require('lodash')

const log = console.log, serialize = JSON.stringify, deserialize = JSON.parse, keysOf = Object.keys

const
	rewrites_with_slash = [
		'/courses',
		'/student-work'
	],
	rewrites_with_html = [
		'/admin'
	]

const proxy_patchy = () => (req, res, next) => {

	if( rewrites_with_slash.includes(req.url) ) {
		req.url += '/'
	}
	else if( rewrites_with_html.includes(req.url) ) {
		req.url += '.html'
	}

	console.log('==',chalk.grey.italic(req.url))
	next()
}

// -- ------------------------------------------------------------------------------------------------------------------

module.exports = eleventyConfig => {

	eleventyConfig.passthroughFileCopy = true,

	eleventyConfig.setLiquidOptions({
		dynamicPartials: true
	});

	// -- filter

	const MarkdownIt = require("markdown-it");
	const mdRender = new MarkdownIt();

	eleventyConfig.addFilter("renderUsingMarkdown", function(rawString) {
		return mdRender.render(rawString);
	});

	eleventyConfig.addFilter("shorten", function(rawString) {
		return String(rawString)
			.replace('CUA40715 ','');
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
		middleware: [
			proxy_patchy()
		]
	});

	return eleventyConfig
}
