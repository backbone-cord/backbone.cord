;(function(Backbone) {
'use strict';

var Cord = Backbone.Cord;
var replace = Cord.replace;

Cord.Router = Backbone.Router.extend({
	route: function(route, name, callback)  {
		if(!callback) {
			callback = name;
			name = '';
		}
		// Allow callback to be a View class or instance and set key/values depending on the matching route params
		if((typeof callback === 'function' && callback.prototype instanceof Backbone.View) || callback instanceof Backbone.View)
			callback = this.createViewCallback(route, callback);
		return Backbone.Router.prototype.route.call(this, route, name, callback);
	},
	execute: function(callback, args) {
		if(!Cord._executeRouters) {
			// Backbone.history by default only calls the first matching router, execute all other routers with matching patterns here
			var i, handler, hist = Backbone.history;
			var fragment = hist.fragment;
			Cord._executeRouters = true;
			try {
				for(i = 0; i < hist.handlers.length; ++i) {
					handler = hist.handlers[i];
					if(handler.route.test(fragment))
						handler.callback(fragment);
				}
			}
			finally {
				Cord._executeRouters = false;
			}
		}
		else {
			// If there is a return value and a container render it, replacing any previously rendered contents
			if(callback) {
				var ret = callback.apply(this, args);
				if(ret && this.container) {
					replace(this.rendered, ret, this.container);
					this.rendered = ret;
				}
			}
			// return false - Backbone.Router.route() will prevent duplicate routing triggers as this execute path is nested inside the single for-loop above
			return false;
		}
	},
	createViewCallback: function(route, view) {
		var i, keys = route.match(/(\(\?)?:\w+/g) || [];
		for(i = 0; i < keys.length; ++i)
			keys[i] = keys[i].substr(1);
		return function() {
			var i, values = {}, result = view;
			if(typeof view === 'function' && view.prototype instanceof Backbone.View) {
				if(this.rendered && Object.getPrototypeOf(this.rendered) === view.prototype)
					result = this.rendered;
				else
					result = new view();
			}
			for(i = 0; i < keys.length; ++i)
				values[keys[i]] = arguments[i];
			result.setValuesForKeys(values);
			return result;
		};
	}
});

})(((typeof self === 'object' && self.self === self && self) || (typeof global === 'object' && global.global === global && global)).Backbone || require('backbone'));
