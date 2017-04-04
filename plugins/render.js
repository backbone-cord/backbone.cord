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
// The render method must return a single element or an array of elements
// Subviews are not allowed inside render
// The returned value from render will then be added to the DOM appended to the view's root el or a #container element if specified
// The new wrapped render function gets set on the view instance and can be given the additional arguments directly. e.g. render(arg1, arg2)
// The new wrapped render() method returns this, so that it can be chained
// The new wrapped render() needs to be explicity called, it does not get called automatically unless some binding has changed within it
// Dynamically created event handlers and reverse binding will not work inside rendered elements because they are not transferable on the virtual-dom update
// Do not use expressions inside render, simply write out the code needed
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
				var key, rendered, container = this.getChildById(Backbone.Cord.config.renderContainerId) || this.el;
				var firstRender = !container.children.length;

				// Cleanup all rendered observers
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
					if(firstRender)
						Backbone.Cord.View.prototype.observe.call(this, '%' + key, observer);
					else
						observer.call(this, key, this.getValueForKey(key));
					if(!this._renderedObservers[key])
						Backbone.Cord.View.prototype.observe.call(this, key, this._renderedObservers[key] = this._renderedObserver);
				};
				this._createSubview = function() { console.error('Subviews not allowed inside render()'); };

				// Render with _createSubview function blocked and observer function wrapped
				rendered = __render.apply(this, this._renderedArgs) || [];
				if(!(rendered instanceof Array))
					rendered = [rendered];
				delete this.observe;
				delete this._createSubview;

				// Update the DOM
				_updateChildren(container, rendered);
				this.trigger('render', this);
				return this;
			};
		}
	},
	binding: function(context, bindings) {
		// Shortcut to render a subview after placement in a layout
		if(bindings.render) {
			Backbone.Cord.setImmediate(context.subview.render.bind(context.subview, bindings.render));
			delete bindings.render;
		}
	}
});

})(((typeof self === 'object' && self.self === self && self) || (typeof global === 'object' && global.global === global && global)).Backbone || require('backbone'));
