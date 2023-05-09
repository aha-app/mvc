// Adds two arrays for the given base (10 or 16), returning the result.
// This turns out to be the only "primitive" operation we need.
const add = function (x: number[], y: number[], base: number) {
  const z = [];
  const n = Math.max(x.length, y.length);
  let carry = 0;
  let i = 0;
  while (i < n || carry) {
    const xi = i < x.length ? x[i] : 0;
    const yi = i < y.length ? y[i] : 0;
    const zi = carry + xi + yi;
    z.push(zi % base);
    carry = Math.floor(zi / base);
    i++;
  }
  return z;
};

// Returns a*x, where x is an array of decimal digits and a is an ordinary
// JavaScript number. base is the number base of the array x.
const multiplyByNumber = function (num: number, x: number[], base: number) {
  if (num < 0) {
    return null;
  }
  if (num === 0) {
    return [];
  }
  let result = [];
  let power = x;
  while (true) {
    if (num & 1) {
      result = add(result, power, base);
    }
    num = num >> 1;
    if (num === 0) {
      break;
    }
    power = add(power, power, base);
  }
  return result;
};
const parseToDigitsArray = function (str, base) {
  const digits = str.split('');
  const ary = [];
  let i = digits.length - 1;

  while (i >= 0) {
    const n = parseInt(digits[i], base);
    if (isNaN(n)) {
      return null;
    }
    ary.push(n);
    i--;
  }
  return ary;
};
const convertBase = function (str, fromBase, toBase) {
  const digits = parseToDigitsArray(str, fromBase);
  if (digits === null) {
    return null;
  }
  let outArray = [];
  let power = [1];
  let i = 0;

  while (i < digits.length) {
    // invariant: at this point, fromBase^i = power
    if (digits[i]) {
      outArray = add(
        outArray,
        multiplyByNumber(digits[i], power, toBase),
        toBase
      );
    }
    power = multiplyByNumber(fromBase, power, toBase);
    i++;
  }
  let out = '';
  i = outArray.length - 1;

  while (i >= 0) {
    out += outArray[i].toString(toBase);
    i--;
  }
  return out;
};

//
// Generate a random ID that can be used in the database.
//
export const randomId = function () {
  const time = new Date();
  const now = Math.round((time.getTime() / 1000) * 256);
  // We want to take the lower 5 bytes from the timestamp, but JS bitwise ops
  // coerce ints to 4 bytes first. So, we split our 64-bit version of our timestamp
  // into high and low 32 bits.
  const now_low = now & 0xffffffff;
  const now_high = (now - now_low) / 0x100000000 - 0x00000001;
  const num = [];
  num[0] = (now_high >> 0) & 0xff;
  num[1] = (now_low >> 24) & 0xff;
  num[2] = (now_low >> 16) & 0xff;
  num[3] = (now_low >> 8) & 0xff;
  num[4] = (now_low >> 0) & 0xff;
  num[5] = Math.floor(Math.random() * 255);
  num[6] = Math.floor(Math.random() * 255);
  num[7] = Math.floor(Math.random() * 255);

  let hex = '';
  let _i = 0;
  const _len = num.length;
  while (_i < _len) {
    const n = num[_i];
    const h = n.toString(16);
    if (n < 16) {
      hex = `${hex}0${h}`;
    } else {
      hex = hex + h;
    }
    _i++;
  }
  return convertBase(hex, 16, 10);
};
