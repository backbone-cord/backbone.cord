;(function(Backbone) {
'use strict';

function _getContainer() {
	// Look for a child with the container id, but default to the view's el
	return this.getChildById(Backbone.Cord.config.containerId) || this.el;
}

function _subview() {
	// Just add to a list of subviews for cleanup on next render
	var subview = this._subview.apply(this, Array.prototype.slice.call(arguments));
	this._renderedSubviews.push(subview);
	return subview;
}

function _once(func) {
	var tid;
	return function() {
		if(!tid)
			tid = setTimeout(func);
	};
}

Backbone.Cord.plugins.push({
	name: 'render',
	config: {
		containerId: 'container'
	},
	initialize: function() {
		if(this.render !== Backbone.View.prototype.render) {
			var __render = this.render.bind(this, this._el.bind(this), _subview.bind(this));
			this.render = function() {
				var i, key, rendered, fragment, container = _getContainer.call(this);
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
				// Render and replace the observe method while rendering, so that observers bound to elements etc aren't saved
				// Instead just a single immediate callback and the actual observer is a debounced render
				this.observe = function(key, observer) {
					Backbone.Cord.View.prototype.observe.call(this, Backbone.Cord.config.oncePrefix + key, observer);
					if(!this._renderedObservers[key])
						Backbone.Cord.View.prototype.observe.call(this, key, this._renderedObservers[key] = _once(this.render.bind(this)));
				};
				this._rendered = __render.apply(this, Array.prototype.slice.call(arguments)) || [];
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
				return this;
			};
			this._rendered = [];
			this._renderedSubviews = [];
			this._renderedObservers = {};
			setTimeout(this.render.bind(this));
		}
	}
});

})(((typeof self === 'object' && self.self === self && self) || (typeof global === 'object' && global.global === global && global)).Backbone || require('backbone'));
