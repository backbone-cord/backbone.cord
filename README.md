About
-------------------------------

**backbone.cord.js** is a Backbone library for data binding and a JSX-compatible declarative layout pipeline.

Requirements
-------------------------------

* Backbone 1.1+, other versions and variants may also work but haven't been tested
* Modern Browser, IE9+ - Array.indexOf, Array.isArray, Object.getPrototypeOf, Object.defineProperty, Object.getOwnPropertyDescriptor, and Function.bind methods are used, possibly others that would need a polyfill on older browsers
* jQuery and/or Underscore.js are NOT required, though normally used with Backbone.

Example
-------------------------------

```javascript
import {h, View} from "backbone.cord";

var MyView = View.extend({
	el() {
		return <p>Hello [model.firstName] [model.lastName].</p>;
	}
});
```

Documentation
-------------------------------

For complete documentation please visit: <https://github.com/backbone-cord/backbone-cord.github.io>

License
-------------------------------
MIT
