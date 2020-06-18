module.exports = function (eleventyConfig) {
  // Add a filter using the Config API

  eleventyConfig.addPassthroughCopy('favicon.ico')
  eleventyConfig.addPassthroughCopy('site.webmanifest')
  eleventyConfig.addPassthroughCopy('img');
  eleventyConfig.addPassthroughCopy('style/*.css');


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
