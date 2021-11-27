import { assert, expect } from "chai";

export const assertRevert = async (promise: Promise<any>) => {
  try {
    await promise;
    assert(false, "Expected to fail");
  } catch (err) {}
};
