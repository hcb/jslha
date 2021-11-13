# jslha
LHA decoder in JavaScript originally created and developed by [Jani Poikela (jpoikela)](https://github.com/jpoikela). 

* Original repo: https://github.com/jpoikela/jslha
## Context

Forked for personal project that relies on `.lzh` files.
## CLI Usage

To run in your terminal: `node index.js <lzh archive>`

For example: `node index.js test/files/timer1.lzh`
## Grunt

For the production files, run the default `grunt` task, which runs `jshint` and `build`.

`build` runs browserify, console-clean, and uglify. Files go into a `dist` folder.

console-clean is a custom task that will replace all `console.log` statements with empty strings.

Note: May need to use `./node_modules/grunt/bin/grunt`