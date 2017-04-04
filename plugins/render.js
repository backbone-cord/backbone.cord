;(function(Backbone) {
'use strict';

function _updateNode(parent, node, vnode) {
	var i, attr, children, removal;
	if(!node) {
		parent.appendChild(vnode);
		return vnode;
	}
	else if(!vnode) {
		parent.removeChild(node);
		return null;
	}
	else if(node.nodeType !== vnode.nodeType || node.nodeName !== vnode.nodeName) {
		parent.replaceChild(vnode, node);
		return vnode;
	}
	else if(node.nodeType === Node.TEXT_NODE && node.textContent !== vnode.textContent) {
		node.textContent = vnode.textContent;
		return node;
	}
	if(node.attributes) {
		for(i = 0; i < node.attributes.length; ++i) {
			attr = node.attributes[i];
			if(!vnode.hasAttribute(attr.name))
				node.removeAttributeNode(attr);
		}
		// Go backwards because attributes is a live NamedNodeMap
		for(i = vnode.attributes.length - 1; i >= 0; --i)
			node.setAttributeNode(vnode.removeAttributeNode(vnode.attributes[i]));
	}
	// Copy childNodes because it is a live NodeList and iteration needs to be forward
	children = Array.prototype.slice.call(vnode.childNodes);
	for(i = 0; i < children.length; ++i) {
		_updateNode(node, node.childNodes[i], children[i]);
	}
	removal = node.childNodes.length - children.length;
	if(removal > 0) {
		for(i = 0; i < removal; ++i)
			node.removeChild(node.lastChild);
	}
	return node;
}

function _updateChildren(parent, vchildren) {
	var i, change, fragment, children = parent.childNodes;
	vchildren = vchildren || [];
	change = Math.min(children.length, vchildren.length);
	for(i = 0; i < change; ++i)
		_updateNode(parent, children[i], vchildren[i]);
	// Add or remove the difference of not changed
	if(vchildren.length > change) {
		fragment = document.createDocumentFragment();
		for(i = change; i < vchildren.length; ++i)
			fragment.appendChild(vchildren[i]);
		parent.appendChild(fragment);
	}
	else if(children.length > change) {
		change = children.length - change;
		for(i = 0; i < change; ++i)
			parent.removeChild(parent.lastChild);
	}
	return parent;
}

function _createSubview() {
	// Just add to a list of subviews for cleanup on next render
	var args;
	if(bindings.render) {
		args = bindings.render;
		delete bindings.render;
	}
	var subview = this.createSubview.apply(this, arguments);
	this._renderedSubviews.push(subview);
	if(args)
		subview.render(args);
	return subview;
}

function _once(func) {
	// Call the inner function only once by tracking a single tid
	var tid;
	return function() {
		if(!tid)
			tid = Backbone.Cord.setImmediate(function() { func(); });
	};
}

// Virtual-dom compare and update methods
Backbone.Cord.Render = {
	updateNode: _updateNode,
	updateChildren: _updateChildren
};

// Plugin to detect and wrap a render function if defined on a Cord View
// The render function, like the el function will have the createElement method always provided as the first argument
// The different is though that additional arguments can be given to the render function and they will be reused when automatic rerenders happen
// The render method must return a single element or subview or an array of mixed elements and subviews
// The returned value from render will then be added to the DOM appended to the view's root el or a #container element if specified
// The new wrapped render function gets set on the view instance and can be given the additional arguments directly. e.g. render(arg1, arg2)
// The new wrapped render() method returns this, so that it can be chained
// The new wrapped render() needs to be explicity called, it does not get called automatically unless some binding has changed within it
// Dynamically created event handlers and reverse binding will not work inside rendered elements because they are not transferable on the virtual-dom update
// Do not use expressions inside render, simply write out the code needed
// Do not reuse subviews inside render, instead create new subview on each render - but then state is not transferred
Backbone.Cord.plugins.push({
	name: 'render',
	config: {
		renderContainerId: 'container'
	},
	initialize: function() {
		if(this.render !== Backbone.View.prototype.render) {
			var __render = this.render.bind(this, this.createElement.bind(this));
			this._renderedObservers = {};
			this.render = function() {
				var i, key, rendered, container;

				// Clean previously rendered subviews
				// TODO: if subview has an id do not remove it, but keep it and return it from _createSubview()
				for(i = 0; i < this._renderedSubviews.length; ++i) {
					// Set the el to null so that remove does not remove the rendered dom
					this._renderedSubviews[i].el = null;
					this._renderedSubviews[i].remove();
				}
				this._renderedSubviews = [];

				for(key in this._renderedObservers) {
					if(this._renderedObservers.hasOwnProperty(key))
						this.unobserve(key, this._renderedObservers[key]);
				}
				this._renderedObservers = {};
				// Check to see if arguments have been updated and save them to be used when calling the __render method
				// The initial setImmediate and observer method both use setImmediate with no arguments, so the arguments should be empty through those calls
				if(arguments.length)
					this._renderedArgs = Array.prototype.slice.call(arguments);
				// Render and replace the observe method while rendering, so that observers bound to elements etc aren't saved
				// Instead just a single immediate callback and the actual observer is a debounced render
				this._renderedObserver = _once(this.render.bind(this));
				this.observe = function(key, observer) {
					if(!this._renderCount)
						Backbone.Cord.View.prototype.observe.call(this, '%' + key, observer);
					else
						observer.call(this, key, this.getValueForKey(key));
					if(!this._renderedObservers[key])
						Backbone.Cord.View.prototype.observe.call(this, key, this._renderedObservers[key] = this._renderedObserver);
				};
				this._createSubview = _createSubview;
				rendered = __render.apply(this, this._renderedArgs) || [];
				delete this._createSubview;
				if(!(rendered instanceof Array))
					rendered = [rendered];
				delete this.observe;

				container = this.getChildById(Backbone.Cord.config.renderContainerId) || this.el;
				_updateChildren(container, rendered);
				this.trigger('render', this);
				return this;
			};
		}
	},
	binding: function(context, bindings) {
		if(bindings.render) {
			Backbone.Cord.setImmediate(subview.render.bind(subview, bindings.render));
			delete bindings.render;
		}
	}
});

})(((typeof self === 'object' && self.self === self && self) || (typeof global === 'object' && global.global === global && global)).Backbone || require('backbone'));
