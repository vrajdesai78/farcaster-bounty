// Some SDK validators use Node's Buffer even in the browser.
import { Buffer } from 'buffer/index.js';
(globalThis as unknown as {Buffer?: typeof Buffer}).Buffer ??= Buffer;
// The SDK initializes legacy test factories when imported. Its declared Faker 7
// dependency has a security advisory, so package.json pins patched Faker 10.
// Keep only the legacy names those factories need; signing never uses Faker.
import { faker } from '@faker-js/faker';
const legacy = faker as unknown as {
  datatype: { number?: (options: {min?:number;max?:number})=>number; datetime?: ()=>Date };
  random?: { alphaNumeric: (length: number)=>string };
};
legacy.datatype.number ??= options => faker.number.int({min: options.min ?? 0, max: options.max ?? 99999});
legacy.datatype.datetime ??= () => faker.date.anytime();
legacy.random ??= { alphaNumeric: length => faker.string.alphanumeric(length) };
