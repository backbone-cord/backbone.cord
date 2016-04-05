;(function(Backbone) {
'use strict';

function _setLength() {
	// Ignore any value given and just use the collection's length
	this._length = this.collection.length;
}

function _getStart() {
	return this._start + 1;
}

function _getEnd() {
	return this._end + 1;
}

function _setStart(value) {
	// Ignore any value given and calculate only when given a value of -1 internally from _updateCalculated()
	var start = 0;
	if(value !== -1)
		return;
	if(this._pageStart > 0)
		start = this._pageStart;
	if(start > this._length)
		start = this._length;
	if(!this._pageLength)
		start = 0;
	this._start = start;
}

function _setEnd(value) {
	// Ignore any value given and calculate only when given a value of -1 internally from _updateCalculated()
	var end = this._length - 1;
	if(value !== -1)
		return;
	if(this._pageLength > 0)
		end = this._start + this._pageLength - 1;
	if(end >= this._length)
		end = this._length - 1;
	if(!this._pageLength)
		end = -1;
	this._end = end;
}

function _setMore(value) {
	if(value !== -1)
		return;
	this._more = this._length - (this._end + 1);
}

function _updateCalculated() {
	// Invoke all set methods for calculations - called from add, remove, and reset methods and indirectly when paging is updated
	this.length = 0;
	this.start = -1;
	this.end = -1;
	this.more = -1;
}

function _setPageStart(value) {
	// Note: Setting pageStart to something >= collection.length, will cause start to be collection.length and end collection.length - 1
	if(this._pageStart === value)
		return;
	this._pageStart = value;
	_resetNodes.call(this);
}

function _setPageLength(value) {
	// Note: Setting pageLength to 0 will cause end to be -1
	if(this._pageLength === value)
		return;
	this._pageLength = value;
	_resetNodes.call(this);
}

function _setSelected(model) {
	var currentView;
	if(this._selected === model)
		return;
	this._selected = model;
	this.setModel(model);
	this.trigger('select', model);
	currentView = this.itemViews._selected;
	if(currentView)
		currentView.selected = false;
	if(model) {
		currentView = this.itemViews[model.cid];
		this.itemViews._selected = currentView;
		currentView.selected = true;
	}
	else {
		delete this.itemViews._selected;
	}
}

function _getContainer() {
	// Look for a child with the container id, but default to the view's el
	return this.getChildById(Backbone.Cord.config.collectionContainerId) || this.el;
}

function _createNode(model) {
	var view = new this.itemView({model: model});
	if(view.sid)
		throw new Error('Item views cannot be passed or created through the subview() method.');
	// Listen to select events from itemView, which will proxy trigger a select even on this view
	this.listenTo(view, 'select', _setSelected);
	this.itemViews[view.model.cid] = view;
	return view;
}

function _sortNodes() {
	var i, key, model, view, child, container;
	container = _getContainer.call(this);
	if(!container || !this._length)
		return;
	if(this._start === 0 && this._end === this._length - 1) {
		// There is no paging, all items are already in the DOM, just need to reorder the items
		child = this.itemViews._first.el;
		for(i = 0; i < this._length; ++i) {
			model = this.collection.at(i);
			view = this.itemViews[model.cid];
			container.insertBefore(view.el, child);
			child = view.el.nextSibling;
		}
		this.itemViews._first = this.itemViews[this.collection.at(0).cid];
	}
	else {
		var itemRemoval = {}; // Copy of hash of model ids, that get removed as resused
		var keys = Object.keys(this.itemViews);
		for(i = 0; i < keys.length; ++i)
			itemRemoval[keys[i]] = true;
		itemRemoval._first = false;
		itemRemoval._selected = false;
		// Create or flag existing views for reuse
		for(i = this._start; i <= this._end; ++i) {
			key = this.collection.at(i).cid;
			if(this.itemViews[key])
				itemRemoval[key] = false;
			else
				this.itemViews[key] = _createNode.call(this, this.collection.at(i));
		}
		// Loop over itemRemoval and remove views
		for(key in itemRemoval) {
			if(itemRemoval.hasOwnProperty(key) && itemRemoval[key]) {
				view = this.itemViews[key];
				if(this._selected === view.model)
					this.selected = null;
				delete this.itemViews[key];
				this.stopListening(view);
				view.remove();
			}
		}
		// Loop over the models and pull from new and existing views
		for(i = this._start; i <= this._end; ++i) {
			view = this.itemViews[this.collection.at(i).cid];
			container.appendChild(view.el);
		}
		this.itemViews._first = this.itemViews[this.collection.at(this._start).cid];
	}
}

function _addNode(model, collection, options) {
	var view, container, sibling, index;
	_updateCalculated.call(this);
	container = _getContainer.call(this);
	if(!container)
		return;
	index = options.index === void(0) ? this._length - 1 : options.index;
	// If the index does not fall between start and end, then return
	if(index < this._start || index > this._end)
		return;
	// Normalize the index to the page
	index = index - this._start;
	// If the page is full and will overflow, remove the last child
	if((this._end - this._start) + 1 === this._pageLength)
		container.removeChild(container.lastChild);
	view = _createNode.call(this, model);
	if(index === this._end) {
		container.appendChild(view.el);
	}
	else {
		sibling = this.itemViews[collection.at(this._start + index + 1).cid].el;
		sibling.parentNode.insertBefore(view.el, sibling);
	}
	if(index === 0)
		this.itemViews._first = view;
}

function _removeNode(model, collection, options) {
	var view, container;
	var more = this._more;
	_updateCalculated.call(this);
	container = _getContainer.call(this);
	if(!container)
		return;
	if(this._selected === model)
		this.selected = null;
	view = this.itemViews[model.cid];
	if(view) {
		delete this.itemViews[model.cid];
		this.stopListening(view);
		view.remove();
		if(options.index >= this._start && options.index <= this._end && more) {
			// A new node needs to be added at the end of the page
			view = _createNode.call(this, collection.at(this._end));
			container.appendChild(view.el);
		}
		this.itemViews._first = this.itemViews[collection.at(this._start).cid];
	}
}

function _resetNodes() {
	// When resetting, no other add, remove, or update events are triggered
	var i, view, fragment, container;
	_removeAll.call(this);
	_updateCalculated.call(this);
	container = _getContainer.call(this);
	if(!container || !this._length)
		return;
	fragment = document.createDocumentFragment();
	for(i = this._start; i <= this._end; ++i) {
		view = _createNode.call(this, this.collection.at(i));
		if(i === this._start)
			this.itemViews._first = view;
		fragment.appendChild(view.el);
	}
	container.appendChild(fragment);
}

function _setup() {
	// Setup event listeners on the collection
	this.listenTo(this.collection, 'add', _addNode);
	this.listenTo(this.collection, 'remove', _removeNode);
	this.listenTo(this.collection, 'sort', _sortNodes);
	this.listenTo(this.collection, 'reset', _resetNodes);
}

function _removeAll() {
	// Cleanup and the second part of _setup() through _resetNodes() - where itemViews and selected gets initialized
	var cid, view;
	if(this.itemViews) {
		delete this.itemViews._first;
		delete this.itemViews._selected;
		for(cid in this.itemViews) {
			if(this.itemViews.hasOwnProperty(cid)) {
				view = this.itemViews[cid];
				this.stopListening(view);
				view.remove();
			}
		}
	}
	this.itemViews = {};
	this.selected = null;
}

function _getItemView(indexModelElement) {
	var key, cid;
	// First assume argument is a model
	cid = indexModelElement.cid;
	// Check for the argument for index, otherwise check for element
	if(typeof indexModelElement === 'number') {
		var model = this.collection.at(indexModelElement);
		if(model)
			cid = model.cid;
	}
	else if(indexModelElement.nodeType === 1) {
		for(key in this.itemViews) {
			if(this.itemViews.hasOwnProperty(key) && this.itemViews[key].el === indexModelElement) {
				cid = key;
				break;
			}
		}
	}
	return (cid ? this.itemViews[cid] : void(0));
}

var __setCollection = Backbone.View.prototype.setCollection;
Backbone.View.prototype.setCollection = function(newCollection) {
	if(this.collection === newCollection)
		return;
	var ret = __setCollection.call(this, newCollection);
	// Collections may change but a collection view must have collection from creation and cannot be later setup
	if(this.isCollectionView) {
		// If undefined or null is passed, substitute with an empty collection instead
		if(!newCollection)
			newCollection = new Backbone.Collection();
		_setup.call(this);
		_resetNodes.call(this);
	}
	return ret;
};

// The collection plugin manages item subviews for a collection, non-item subviews will be managed by Cord and when items are selected the model will be set on all of these subviews
// The model property will automatically be set with setModel() when select()/unselect() is called
// itemView: function(model) { return a subview but NOT using the subview method; subview management is different } only subviews are allowed for items not elements
// Binding {!_length} can be used to check for empty collection
// empty view is simply by using hidden for both _length and !_length
// How to create a selection view as a subview and as a sibling view?
// as a subview setModel will be called, but no way to determine empty model? maybe add field to empty model? or if this.model can be null need to define something under setModel?
// as sibling setModel after a select event on the parent
// NOTE - Not using update anymore - Requires 1.2.0 or greater for the update event
// Requires a container be defined with the id #container
Backbone.Cord.plugins.push({
	name: 'collection',
	config: {
		collectionContainerId: 'container'
	},
	initialize: function() {
		if(this.collection && this.itemView) {
			this.isCollectionView = true;
			this.getItemView = _getItemView;
			this._getStart = _getStart;
			this._getEnd = _getEnd;
			this._setLength = _setLength;
			this._setStart = _setStart;
			this._setEnd = _setEnd;
			this._setMore = _setMore;
			this._setPageStart = _setPageStart;
			this._setPageLength = _setPageLength;
			this._setSelected = _setSelected;
			this._pageStart = 0;
			this._pageLength = -1;
			this._selected = null;
			Object.defineProperty(this, 'length', this._wrappedPropertyDescriptor('length'));
			Object.defineProperty(this, 'start', this._wrappedPropertyDescriptor('start'));
			Object.defineProperty(this, 'end', this._wrappedPropertyDescriptor('end'));
			Object.defineProperty(this, 'more', this._wrappedPropertyDescriptor('more'));
			Object.defineProperty(this, 'pageStart', this._wrappedPropertyDescriptor('pageStart'));
			Object.defineProperty(this, 'pageLength', this._wrappedPropertyDescriptor('pageLength'));
			Object.defineProperty(this, 'selected', this._wrappedPropertyDescriptor('selected'));
			// Setup, set initial calculated values, and then on next tick, run reset (not based on events to add loading, empty, or render)
			_setup.call(this);
			_updateCalculated.call(this);
			setTimeout(_resetNodes.bind(this), 0);
		}
	},
	remove: function() {
		if(this.isCollectionView && this.itemViews) {
			_removeAll.call(this);
		}
	}
});

})(((typeof self === 'object' && self.self === self && self) || (typeof global === 'object' && global.global === global && global)).Backbone);
