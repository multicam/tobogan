const chalk = require('chalk'), chokidar = require('chokidar'), promise = require('bluebird'), sass = require('node-sass'), path = require('path')

const log = console.log, serialize = JSON.stringify, deserialize = JSON.parse, keysOf = Object.keys

const sass_install = dir => {
	log('sass install', dir)
	chokidar.watch(dir).on('all', (event, path) => {
		log(`processing ${path} on ${event}`)
	});
}

const sass_process = file => {
	return new promise((resolve, reject) => {
		sass.render({file: file}, (error, result) => {
			error && reject(error);
			resolve(result);
			log(result)
		});
	});
}

const proxy_patchy = () => (req, res, next) => {
	const rewrites = [
		'/student-work'
	]

	if( rewrites.includes(req.url) ) {
		req.url += '.html'
	}

	console.log('==',chalk.grey.italic(req.url))
	next()
}

module.exports = function (eleventyConfig) {

	sass_install('style/')

	// promise.all([
	// 	sass_process('style/index.scss'),
	// 	sass_process('style/typography.scss')
	// ]).then( res => {
		eleventyConfig.addPassthroughCopy('style/*.css');
	// })

	eleventyConfig.addPassthroughCopy('images');
  eleventyConfig.addPassthroughCopy('img');


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
