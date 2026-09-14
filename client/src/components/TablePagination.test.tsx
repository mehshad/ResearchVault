import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { TablePagination } from "./TablePagination";

describe("TablePagination", () => {
  it("renders nothing when everything fits on one page", () => {
    const { container } = render(<TablePagination total={12} page={1} onPageChange={() => {}} what="grants" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("says which rows are shown and moves a page at a time", async () => {
    const onPageChange = vi.fn();
    render(<TablePagination total={272} page={2} onPageChange={onPageChange} what="grants" />);

    expect(screen.getByText("Showing 51–100 of 272 grants")).toBeInTheDocument();
    expect(screen.getByText("Page 2 of 6")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /next page/i }));
    expect(onPageChange).toHaveBeenLastCalledWith(3);
    await userEvent.click(screen.getByRole("button", { name: /previous page/i }));
    expect(onPageChange).toHaveBeenLastCalledWith(1);
  });

  it("disables the control at either end", () => {
    const { rerender } = render(<TablePagination total={272} page={1} onPageChange={() => {}} />);
    expect(screen.getByRole("button", { name: /previous page/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /next page/i })).toBeEnabled();

    rerender(<TablePagination total={272} page={6} onPageChange={() => {}} />);
    expect(screen.getByRole("button", { name: /next page/i })).toBeDisabled();
  });

  it("clamps a page past the end to the last page", () => {
    render(<TablePagination total={272} page={99} onPageChange={() => {}} />);
    expect(screen.getByText("Page 6 of 6")).toBeInTheDocument();
  });
});
