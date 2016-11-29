;(function(Backbone) {
'use strict';

function _getContainer() {
	// Look for a child with the container id, but default to the view's el
	return this.getChildById(Backbone.Cord.config.renderContainerId) || this.el;
}

function _createSubview() {
	// Just add to a list of subviews for cleanup on next render
	var subview = this.createSubview.apply(this, arguments);
	this._renderedSubviews.push(subview);
	return subview;
}

function _once(func) {
	// Call the inner function but only once on the next tick
	var tid;
	return function() {
		if(!tid)
			tid = setTimeout(func);
	};
}

// Plugin to detect and wrap a render function if defined on a Cord View
// The render function, like the el function will have the createElement and createSubview method always given as the first two arguments
// The different is though that additional arguments can be given to the render function and they will be reused when automatic rerenders happen
// The render method must return a single element or subview or an array of mixed elements and subviews
// The returned value from render will then be placed into a documentFragment to be added to the DOM appended to the view's root el or a #container element if specified
// The new wrapped render function gets set on the view instance and can be given the additional arguments directly. e.g. render(arg1, arg2)
// The new wrapped render() method returns this, so that it can be chained
// The enw wrapped render() needs to be explicity called, it does not get called automatically unless some binding has changed within it
// NOTE: do not use reverse binding until more testing is done
Backbone.Cord.plugins.push({
	name: 'render',
	config: {
		renderContainerId: 'container'
	},
	initialize: function() {
		if(this.render !== Backbone.View.prototype.render) {
			var __render = this.render.bind(this, this.createElement.bind(this), _createSubview.bind(this));
			this.render = function() {
				var i, key, rendered, renderedObserver, fragment, container = _getContainer.call(this);
				// Cleanup from last render, elements, subviews, and observers
				for(i = 0; i < this._rendered.length; ++i) {
					rendered = this._rendered[i];
					if(!(rendered instanceof Backbone.View))
						container.removeChild(rendered);
				}
				this._rendered = null;
				for(i = 0; i < this._renderedSubviews.length; ++i)
					this._renderedSubviews[i].remove();
				this._renderedSubviews = [];
				for(key in this._renderedObservers) {
					if(this._renderedObservers.hasOwnProperty(key))
						this.unobserve(key, this._renderedObservers[key]);
				}
				this._renderedObservers = {};
				// Check to see if arguments have been updated and save them to be used when calling the __render method
				// The initial setTimeout and observer method both use setTimeout with no arguments, so the arguments should be empty through those calls
				if(arguments.length)
					this._renderedArgs = Array.prototype.slice.call(arguments);
				// Render and replace the observe method while rendering, so that observers bound to elements etc aren't saved
				// Instead just a single immediate callback and the actual observer is a debounced render
				renderedObserver = _once(this.render.bind(this));
				this.observe = function(key, observer) {
					Backbone.Cord.View.prototype.observe.call(this, '%' + key, observer);
					if(!this._renderedObservers[key])
						Backbone.Cord.View.prototype.observe.call(this, key, this._renderedObservers[key] = renderedObserver);
				};
				this._rendered = __render.apply(this, this._renderedArgs) || [];
				if(!(this._rendered instanceof Array))
					this._rendered = [this._rendered];
				delete this.observe;
				// Add the new rendered nodes to the container
				fragment = document.createDocumentFragment();
				for(i = 0; i < this._rendered.length; ++i) {
					rendered = this._rendered[i];
					if(rendered instanceof Backbone.View)
						fragment.appendChild(rendered.el);
					else
						fragment.appendChild(rendered);
				}
				container.appendChild(fragment);
				this.trigger('render');
				return this;
			};
			this._rendered = [];
			this._renderedArgs = [];
			this._renderedSubviews = [];
			this._renderedObservers = {};
		}
	}
});

})(((typeof self === 'object' && self.self === self && self) || (typeof global === 'object' && global.global === global && global)).Backbone || require('backbone'));
