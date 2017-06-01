;(function(Backbone) {
'use strict';

var Cord = Backbone.Cord;
var ForceValue = Cord.ForceValue;

Cord.mixins.collection = {
	collection: Cord.EmptyCollection,
	properties: {
		length: {
			readonly: true,
			value: 0
		},
		start: function(length, pageStart, pageLength) {
			if(length === '__args__')
				return ['length', 'pageStart', 'pageLength'];
			var start = 0;
			if(pageStart > 0)
				start = pageStart;
			if(start > length)
				start = length;
			if(!pageLength)
				start = 0;
			return start;
		},
		end: function(start, length, pageStart, pageLength) {
			if(start === '__args__')
				return ['start', 'length', 'pageStart', 'pageLength'];
			var end = length - 1;
			if(pageLength > 0)
				end = start + pageLength - 1;
			if(end >= length)
				end = length - 1;
			if(!pageLength)
				end = -1;
			return end;
		},
		more: function(end, length) {
			if(end === '__args__')
				return ['end', 'length'];
			return length - (end + 1);
		},
		pageStart: {
			set: function(value) {
				this._pageStart = value;
				this._onResetCollection();
			},
			value: 0
		},
		pageLength: {
			set: function(value) {
				this._pageLength = value;
				this._onResetCollection();
			},
			value: -1
		},
		selected: {
			set: function(model) {
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
			},
			value: null
		}
	},
	initialize: function() {
		// Call setCollection to setup the listeners
		this.setCollection(this.collection, true);
	},
	remove: function() {
		// Cleanup first by removing all of the items
		this._removeAllItems();
	},
	setCollection: function(newCollection, init) {
		// Setup event listeners on the collection
		if(this.collection !== newCollection || init) {
			if(newCollection) {
				this.listenTo(newCollection, 'add', this._onAddItem);
				this.listenTo(newCollection, 'remove', this._onRemoveItem);
				this.listenTo(newCollection, 'sort', this._onSortCollection);
				this.listenTo(newCollection, 'reset', this._onResetCollection);
			}
			// Reset everything after the parent setCollection actually sets this.collection
			Cord.setImmediate(this._onResetCollection.bind(this));
		}
	},
	getCollectionContainer: function() {
		// Look for a child with the container id, but default to the view's el
		return this.getChildById(Cord.config.collectionContainerId) || this.el;
	},
	createItemView: function(model) {
		var view = new this.itemView({model: model});
		if(view.sid)
			throw new Error('Item views cannot be passed or created through the subview() method.');
		// Listen to select events from itemView, which will proxy trigger a select even on this view
		this.listenTo(view, 'select', function(view) {
			this.selected = view.model;
		});
		// If the itemView calls remove() on itself then remove the corresponding model
		this.listenTo(view, 'remove', function(view) {
			this.collection.remove(view.model, {viewRemoved: true});
		});
		this.itemViews[view.model.cid] = view;
		return view;
	},
	getItemView: function(indexModelElement) {
		var key, cid;
		// First assume argument is a model
		cid = indexModelElement.cid;
		// Check for the argument for index, otherwise check for element
		if(typeof indexModelElement === 'number') {
			var model = this.collection.at(indexModelElement);
			if(model)
				cid = model.cid;
		}
		else if(indexModelElement.nodeType === Node.ELEMENT_NODE) {
			for(key in this.itemViews) {
				if(this.itemViews[key].el === indexModelElement) {
					cid = key;
					break;
				}
			}
		}
		return (cid ? this.itemViews[cid] : void(0));
	},
	_removeAllItems: function() {
		// Cleanup on remove and the first part of _onResetCollection()
		var cid, view;
		if(this.itemViews) {
			delete this.itemViews._first;
			delete this.itemViews._selected;
			for(cid in this.itemViews) {
				view = this.itemViews[cid];
				this.stopListening(view);
				view.remove();
			}
		}
		this.itemViews = {};
		this.selected = null;
	},
	_onAddItem: function(model, collection, options) {
		var view, container, sibling, index;
		this.length = new ForceValue(collection.length);
		container = this.getCollectionContainer();
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
		view = this.createItemView(model);
		if(index === this._end) {
			container.appendChild(view.el);
		}
		else {
			sibling = this.itemViews[collection.at(this._start + index + 1).cid].el;
			sibling.parentNode.insertBefore(view.el, sibling);
		}
		if(index === 0)
			this.itemViews._first = view;
	},
	_onRemoveItem: function(model, collection, options) {
		var view, container;
		var more = this._more;
		this.length = new ForceValue(collection.length);
		container = this.getCollectionContainer();
		if(!container)
			return;
		if(this._selected === model)
			this.selected = null;
		view = this.itemViews[model.cid];
		if(view) {
			delete this.itemViews[model.cid];
			// Stop listening to prevent the remove event on the itemView
			// and remove the actual view only if the itemView did not remove() itself
			this.stopListening(view);
			if(!options.viewRemoved)
				view.remove();
			if(options.index >= this._start && options.index <= this._end && more) {
				// A new node needs to be added at the end of the page
				view = this.createItemView(collection.at(this._end));
				container.appendChild(view.el);
			}
			if(collection.length)
				this.itemViews._first = this.itemViews[collection.at(this._start).cid];
			else
				delete this.itemViews._first;
		}
	},
	_onSortCollection: function() {
		var i, key, model, view, child, container;
		container = this.getCollectionContainer();
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
					this.itemViews[key] = this.createItemView(this.collection.at(i));
			}
			// Loop over itemRemoval and remove views
			for(key in itemRemoval) {
				if(itemRemoval[key]) {
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
	},
	_onResetCollection: function() {
		// When resetting, no other add, remove, or update events are triggered
		var i, view, fragment, container;
		this._removeAllItems();
		this.length = new ForceValue(this.collection.length);
		container = this.getCollectionContainer();
		if(!container || !this._length)
			return;
		fragment = document.createDocumentFragment();
		for(i = this._start; i <= this._end; ++i) {
			view = this.createItemView(this.collection.at(i));
			if(i === this._start)
				this.itemViews._first = view;
			fragment.appendChild(view.el);
		}
		container.appendChild(fragment);
	}
};

Cord.plugins.push({
	name: 'collection',
	requirements: ['computed'],
	config: {
		collectionContainerId: 'itemContainer'
	}
});

})(((typeof self === 'object' && self.self === self && self) || (typeof global === 'object' && global.global === global && global)).Backbone || require('backbone'));
