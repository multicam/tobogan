const chalk = require('chalk'), chokidar = require('chokidar'), promise = require('bluebird'), sass = require('node-sass'), path_ = require('path'), fs = require('fs')

const log = console.log, serialize = JSON.stringify, deserialize = JSON.parse, keysOf = Object.keys

const
	rewrites = [
		'/courses',
		'/courses2',
		'/student-work'
	],
	stylesheets = [
		'index.scss',
		'typography.scss'
	]


const sass_watch = dir => {
	log('sass install', dir)
	chokidar.watch(dir).on('all', (event, path) => {
		log(`chk ${path} on ${event} (${path_.basename(path)})`)
		stylesheets.includes(path_.basename(path)) && event === 'change' && event === 'add' && sass_process(path).then( res => log('xxx', res)).catch(log)
	});
}

const sass_process = file => {
	const pos = file.lastIndexOf("."), resFile = file.substr(0, pos < 0 ? file.length : pos) + ".css";
	return pos !== -1 && new promise((resolve, reject) => {
		sass.render({file: file}, (error, result) => {
			error && log(error) && reject(error);
			log('->',resFile, result)
			result && result.css && fs.writeFileSync(resFile, result.css, 'utf8')
			resolve(true);
		});
	});

}

const proxy_patchy = () => (req, res, next) => {
	if( rewrites.includes(req.url) ) {
		req.url += '.html'
	}

	console.log('==',chalk.grey.italic(req.url))
	next()
}

module.exports = function (eleventyConfig) {

	const MarkdownIt = require("markdown-it");
	const mdRender = new MarkdownIt();

	eleventyConfig.addFilter("renderUsingMarkdown", function(rawString) {
		return mdRender.render(dispatchEvent);
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
