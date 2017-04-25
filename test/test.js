const assert = require('assert');
const cord = require('../cord');

describe('copy methods', () => {
	describe('copyObj({})', () => {
		let orig = {};
		let copy = cord.copyObj(orig);
		it('copy should not be original', () => assert.notStrictEqual(orig, copy));
		it('copy should be equal to original', () => assert.deepEqual(orig, copy));
		it('copy should be empty', () => assert.ok(!Object.keys(copy).length));
	});
	describe('copyObj({a:123, b: [], c: "string", sub: {}})', () => {
		let orig = {a:123, b: [], c: "string", sub: {}};
		let copy = cord.copyObj(orig);
		it('copy should not be original', () => assert.notStrictEqual(orig, copy));
		it('copy should be equal to original', () => assert.deepEqual(orig, copy));
		it('copy should have the same primitive keys and values', () => {
			assert.strictEqual(orig.a, copy.a);
			assert.strictEqual(orig.b, copy.b);
			assert.strictEqual(orig.c, copy.c);
		});
		it('copy sub object should not be the original sub object', () => {
			assert.notStrictEqual(orig.sub, copy.sub);
		});
		it('altering copy primitive should not alter original', () => {
			copy.a = 'hello';
			assert.notEqual(orig.a, copy.a);
		});
		it('altering copy arrays should alter original', () => {
			copy.b.push('hello');
			assert.deepEqual(orig.b, copy.b);
		});
	});
	describe('copyObj({a:{a:123, b:456, c:789}, b:{a:901}})', () => {
		let orig = {a:{a:123, b:456, c:789}, b:{a:901}};
		let copy = cord.copyObj(orig);
		it('copy should not be original', () => assert.notStrictEqual(orig, copy));
		it('copy should be equal to original', () => assert.deepEqual(orig, copy));
		it('copy sub object should not be the original sub object', () => {
			assert.notStrictEqual(orig.a, copy.a);
			assert.notStrictEqual(orig.b, copy.b);
		});
		it('sub objects should equal the original sub objects', () => {
			assert.deepEqual(orig.a, copy.a);
			assert.deepEqual(orig.b, copy.b);
		});
	});
	describe('copyObj({a:subclass})', () => {
		let Subclass = function() { this.a = 123; this.b = 456; };
		let orig = {sub:new Subclass()};
		let copy = cord.copyObj(orig);
		it('copy should not be original', () => assert.notStrictEqual(orig, copy));
		it('copy should be equal to original', () => assert.deepEqual(orig, copy));
		it('altering copy.sub should alter original.sub', () => {
			copy.sub.a = 'hello';
			assert.deepEqual(orig.sub, copy.sub);
		});
	});
});

describe('mix methods', () => {
	describe('mixObj()', () => {
		let combined = cord.mixObj(
			{a: 2, styles: {cursor: 'pointer', div: { display: 'block'}}},
			{b: 3, styles: {color: 'blue', font: 'times'}},
			{c: 4, styles: {color: 'red', div: { textAlign: 'center'}}}
		);
		let chained = cord.mixObj(
			{a: 2, foo() { ++this.a; return this.a; }},
			{b: 3, foo() { ++this.b; return this.b; }},
			{c: 4, foo() { ++this.c; return this.c; }}
		);
		it('combined should have a, b, c, and styles subobject combined', () => {
			assert.deepEqual({a: 2, b: 3, c: 4, styles: { cursor: 'pointer', color: 'red', font: 'times', div: {textAlign: 'center', display: 'block'}}}, combined);
		});
		it('chained.foo should increment a, b, and c, and return c', () => {
			let ret = chained.foo();
			assert.equal(ret, chained.c);
			assert.equal(chained.a, 3);
			assert.equal(chained.b, 4);
			assert.equal(chained.c, 5);
		});
	});
});

describe('convert methods', () => {
	describe('convertToString(5)', () => {
		let str = cord.convertToString(5);
		it('should be 5', () => assert.equal(str, '5'));
		it('should be a string', () => assert.equal(typeof str, 'string'));
	});
	describe('convertToString(null)', () => {
		let str = cord.convertToString(null);
		it('should be empty', () => assert.equal(str, ''));
		it('should be a string', () => assert.equal(typeof str, 'string'));
	});
	describe('convertToBool("string")', () => {
		let b = cord.convertToBool('string');
		it('should be true', () => assert.equal(b, true));
	});
	describe('convertToBool(5)', () => {
		let b = cord.convertToBool(5);
		it('should be true', () => assert.equal(b, true));
	});
	describe('convertToBool({})', () => {
		let b = cord.convertToBool({});
		it('should be true', () => assert.equal(b, true));
	});
	describe('convertToBool(null)', () => {
		let b = cord.convertToBool(null);
		it('should be false', () => assert.equal(b, false));
	});
	describe('convertToBool([])', () => {
		let b = cord.convertToBool([]);
		it('should be false', () => assert.equal(b, false));
	});
	describe('convertToBool("")', () => {
		let b = cord.convertToBool('');
		it('should be false', () => assert.equal(b, false));
	});
});

describe('EmptyModel', () => {
	describe('set(key, value) should be a noop', () => {
		cord.EmptyModel.set('key', 'value');
		let value = cord.EmptyModel.get('key');
		it('get(key) should be undefined', () => assert.equal(value, undefined));
	});
});

