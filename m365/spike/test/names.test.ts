import { describe, expect, it } from "vitest";
import { assertEmail, assertGuid, assertId, assertValidFileName, InvalidInputError, isFirmEmail } from "../lib/m365/names";

describe("assertValidFileName", () => {
  it("returns valid names unchanged", () => {
    for (const name of ["Brief.docx", "Q1 report (final).pdf", "a".repeat(255), "contract.v2", "~draft", "Été 2026.txt"]) {
      expect(assertValidFileName(name)).toBe(name);
    }
  });

  it.each([
    ["", "File name is empty."],
    ["a".repeat(256), "File name is longer than 255 characters."],
    [" lead", "File name starts or ends with a space."],
    ["trail ", "File name starts or ends with a space."],
    ["ends.", "File name ends with a period."],
    ["a:b", 'File name contains one of " * : < > ? / \\ |'],
    ["a/b", 'File name contains one of " * : < > ? / \\ |'],
    ["a\\b", 'File name contains one of " * : < > ? / \\ |'],
    ["a|b", 'File name contains one of " * : < > ? / \\ |'],
    ['a"b', 'File name contains one of " * : < > ? / \\ |'],
    ["tab\there", 'File name contains one of " * : < > ? / \\ |'],
    ["CON", "File name is reserved by SharePoint."],
    ["com1", "File name is reserved by SharePoint."],
    ["desktop.ini", "File name is reserved by SharePoint."],
    [".lock", "File name is reserved by SharePoint."],
    ["~$Brief.docx", "File name is reserved by SharePoint."],
    ["my_vti_file", "File name is reserved by SharePoint."],
  ])("rejects %j", (name, message) => {
    expect(() => assertValidFileName(name)).toThrow(new InvalidInputError(message));
  });

  it("rejects a non-string at runtime", () => {
    expect(() => assertValidFileName(42 as unknown as string)).toThrow(InvalidInputError);
  });
});

describe("assertId", () => {
  it("accepts single path segments, including Graph's punctuation", () => {
    expect(assertId("01ABC!123")).toBe("01ABC!123");
    expect(assertId("b!x-y_z=")).toBe("b!x-y_z=");
    expect(assertId("x".repeat(1024))).toHaveLength(1024);
  });

  it.each([[""], ["a b"], ["a/b"], ["a\\b"], ["a?b"], ["a#b"], ["x".repeat(1025)], [undefined], [null], [7]])("rejects %j", (value) => {
    expect(() => assertId(value)).toThrow("Invalid id.");
  });

  it("names the field in the message", () => {
    expect(() => assertId("", "drive id")).toThrow("Invalid drive id.");
  });
});

describe("assertEmail", () => {
  it("accepts ordinary addresses", () => {
    expect(assertEmail("jane.doe+x@firm.example")).toBe("jane.doe+x@firm.example");
  });

  it.each([["jane"], ["jane@firm"], ["@firm.example"], ["a b@firm.example"], ["a@b@c.example"], ["<a@b.example>"], ["a@b.example,c@d.example"], [`${"a".repeat(310)}@firm.example`], [undefined], [3]])(
    "rejects %j",
    (value) => {
      expect(() => assertEmail(value)).toThrow(new InvalidInputError("Invalid email address."));
    },
  );
});

describe("isFirmEmail", () => {
  const domains = ["firm.example", "Firm.CO.uk"];

  it("matches the domain after the last @, case-insensitively", () => {
    expect(isFirmEmail("jane@FIRM.example", domains)).toBe(true);
    expect(isFirmEmail("jane@firm.co.uk", domains)).toBe(true);
  });

  it("does not match subdomains, look-alikes or malformed addresses", () => {
    expect(isFirmEmail("jane@sub.firm.example", domains)).toBe(false);
    expect(isFirmEmail("jane@firm.example.evil", domains)).toBe(false);
    expect(isFirmEmail("firm.example@evil.example", domains)).toBe(false);
    expect(isFirmEmail("@firm.example", domains)).toBe(false);
    expect(isFirmEmail("no-at-sign", domains)).toBe(false);
  });

  it("treats everyone as external when no domains are configured", () => {
    expect(isFirmEmail("jane@firm.example", [])).toBe(false);
  });
});

describe("assertGuid", () => {
  it("accepts GUIDs in either case", () => {
    expect(assertGuid("0f8fad5b-d9cb-469f-a165-70867728950e")).toBe("0f8fad5b-d9cb-469f-a165-70867728950e");
    expect(assertGuid("0F8FAD5B-D9CB-469F-A165-70867728950E")).toBe("0F8FAD5B-D9CB-469F-A165-70867728950E");
  });

  it("rejects anything else, naming the field", () => {
    expect(() => assertGuid("0f8fad5bd9cb469fa16570867728950e")).toThrow("Invalid id.");
    expect(() => assertGuid("0f8fad5b-d9cb-469f-a165-70867728950e ", "group id")).toThrow("Invalid group id.");
    expect(() => assertGuid(undefined)).toThrow(InvalidInputError);
  });
});
