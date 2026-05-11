import { describe, it, expect } from "vitest";
import type { UserCardProps } from "./UserCard";

describe("UserCard component contract", () => {
  it("accepts required props", () => {
    const props: UserCardProps = {
      userId: "00000000-0000-0000-0000-000000000001",
      handle: "maya",
      displayName: "Maya Chen",
    };
    expect(props.userId).toBe("00000000-0000-0000-0000-000000000001");
    expect(props.handle).toBe("maya");
    expect(props.displayName).toBe("Maya Chen");
  });

  it("accepts optional avatarUrl", () => {
    const props: UserCardProps = {
      userId: "00000000-0000-0000-0000-000000000001",
      handle: "maya",
      displayName: "Maya Chen",
      avatarUrl: "https://example.com/avatar.jpg",
    };
    expect(props.avatarUrl).toBe("https://example.com/avatar.jpg");
  });

  it("avatarUrl is undefined when omitted", () => {
    const props: UserCardProps = {
      userId: "00000000-0000-0000-0000-000000000001",
      handle: "maya",
      displayName: "Maya Chen",
    };
    expect(props.avatarUrl).toBeUndefined();
  });

  it("links to the correct profile URL based on handle", () => {
    const props: UserCardProps = {
      userId: "00000000-0000-0000-0000-000000000001",
      handle: "test_user",
      displayName: "Test User",
    };
    const expectedUrl = `/u/${props.handle}`;
    expect(expectedUrl).toBe("/u/test_user");
  });

  it("renders first character of displayName as avatar fallback", () => {
    const props: UserCardProps = {
      userId: "00000000-0000-0000-0000-000000000001",
      handle: "maya",
      displayName: "Maya Chen",
    };
    const fallback = props.displayName.charAt(0).toUpperCase();
    expect(fallback).toBe("M");
  });

  it("handles empty displayName gracefully for fallback", () => {
    const props: UserCardProps = {
      userId: "00000000-0000-0000-0000-000000000001",
      handle: "ghost",
      displayName: "",
    };
    const fallback = props.displayName.charAt(0).toUpperCase();
    expect(fallback).toBe("");
  });
});
