import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { QueryError } from "./QueryError";

describe("QueryError", () => {
  it("names what could not load and offers a retry", async () => {
    const onRetry = vi.fn();
    render(<QueryError what="grants" error={new Error("500: Internal Server Error")} onRetry={onRetry} />);

    expect(screen.getByRole("alert")).toHaveTextContent("Could not load grants.");
    expect(screen.getByText(/server reported a fault/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("turns a status into a sentence a reader can act on", () => {
    const { rerender } = render(<QueryError what="staff" error={new Error("403: Forbidden")} />);
    expect(screen.getByText(/does not have access/i)).toBeInTheDocument();

    rerender(<QueryError what="staff" error={new Error("401: Unauthorized")} />);
    expect(screen.getByText(/session has ended/i)).toBeInTheDocument();
  });

  it("shows a message the server wrote for people", () => {
    render(<QueryError what="grants" error={new Error('409: {"message":"That grant is being edited by someone else."}')} />);
    expect(screen.getByText("That grant is being edited by someone else.")).toBeInTheDocument();
  });

  it("has no retry button when nothing to retry was given", () => {
    render(<QueryError what="grants" />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText(/check your connection/i)).toBeInTheDocument();
  });
});
