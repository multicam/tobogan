const chalk = require('chalk')

const proxy_patchy = () => (req, res, next) => {
	req.url = req.url === '/' || req.url === '' ? '/' : req.url + '.html'

	console.log('==',chalk.grey.italic(req.url))

	next()
}

module.exports = function (eleventyConfig) {

  eleventyConfig.addPassthroughCopy('favicon.ico')
  eleventyConfig.addPassthroughCopy('site.webmanifest')
  eleventyConfig.addPassthroughCopy('images');
  eleventyConfig.addPassthroughCopy('img');
  eleventyConfig.addPassthroughCopy('style/*.css');

	eleventyConfig.setBrowserSyncConfig({
		notify: true,
		callbacks: {
			ready: (err,bs) => {
				err && console.log(err)
			}
		}
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
