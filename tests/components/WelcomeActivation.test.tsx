import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  WelcomeActivation,
  type WelcomeContentItem,
} from "@/components/ui/WelcomeActivation";
import {
  APP_ONBOARDING_TOUR_KEY,
  APP_ONBOARDING_VERSION,
  WELCOME_PERSONALIZATION_TOUR_KEY,
  WELCOME_PERSONALIZATION_VERSION,
} from "@/lib/onboarding";

const { replaceMock, rpcMock, toastErrorMock, toastSuccessMock } = vi.hoisted(
  () => ({
    replaceMock: vi.fn(),
    rpcMock: vi.fn(),
    toastErrorMock: vi.fn(),
    toastSuccessMock: vi.fn(),
  }),
);

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ rpc: rpcMock }),
}));

vi.mock("sonner", () => ({
  toast: { error: toastErrorMock, success: toastSuccessMock },
}));

const items: WelcomeContentItem[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    title: "The Psychology of Money",
    author: "Morgan Housel",
    category: "Psychology",
    cover_image_url: null,
    type: "book",
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    title: "Thinking in Systems",
    author: "Donella Meadows",
    category: "Business",
    cover_image_url: null,
    type: "book",
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    title: "Deep Work",
    author: "Cal Newport",
    category: "Creativity",
    cover_image_url: null,
    type: "book",
  },
];

describe("WelcomeActivation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpcMock.mockResolvedValue({ error: null });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({ ok: true })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ items }) })
        .mockResolvedValue({ ok: true }),
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  it("requires interests before showing the starter shelf", async () => {
    render(<WelcomeActivation nextUrl="/browse" items={items} />);

    const continueButton = screen.getByRole("button", {
      name: /build your starter shelf/i,
    });
    expect(continueButton).toBeDisabled();

    await userEvent.click(
      screen.getByRole("button", { name: "Psychology & the Brain" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Business & Strategy" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Wealth & Investing" }),
    );
    expect(continueButton).toBeEnabled();

    await userEvent.click(continueButton);
    await waitFor(() =>
      expect(
        screen.getByText(/save a few ideas to return to/i),
      ).toBeInTheDocument(),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      "/api/onboarding/preferences",
      expect.objectContaining({ method: "PUT" }),
    );
  });

  it("guides topic selection and explains the five-topic limit", async () => {
    render(<WelcomeActivation nextUrl="/browse" items={items} preview />);

    expect(
      screen.getByText("0 selected · Choose at least 3"),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Psychology & the Brain" }),
    );
    expect(screen.getByText("1 selected · Choose 2 more")).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Business & Strategy" }),
    );
    expect(screen.getByText("2 selected · Choose 1 more")).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Wealth & Investing" }),
    );
    expect(
      screen.getByText("3 selected · You can choose up to 2 more"),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Habits & Productivity" }),
    );
    expect(
      screen.getByText("4 selected · You can choose 1 more"),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "AI & Emerging Tech" }),
    );
    expect(
      screen.getByText(
        "5 selected · Maximum reached — deselect one to choose another",
      ),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Mindset & Philosophy" }),
    );
    expect(
      screen.getByText(
        "You can choose up to 5 topics. Deselect one to choose another.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Mindset & Philosophy" }),
    ).toHaveAttribute("aria-pressed", "false");

    await userEvent.click(
      screen.getByRole("button", { name: "AI & Emerging Tech" }),
    );
    expect(
      screen.getByText("4 selected · You can choose 1 more"),
    ).toBeInTheDocument();
  });

  it("saves three items then takes the user to their library", async () => {
    render(<WelcomeActivation nextUrl="/browse" items={items} />);

    await userEvent.click(
      screen.getByRole("button", { name: "Psychology & the Brain" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Business & Strategy" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Wealth & Investing" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: /build your starter shelf/i }),
    );

    const saveButtons = await screen.findAllByRole("button", {
      name: /save .* to your library/i,
    });
    for (const button of saveButtons) await userEvent.click(button);

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /explore your library/i }),
      ).toBeEnabled(),
    );
    expect(fetch).toHaveBeenCalledTimes(5);

    await userEvent.click(
      screen.getByRole("button", { name: /explore your library/i }),
    );

    await waitFor(() => {
      expect(rpcMock).toHaveBeenCalledWith("set_onboarding_state", {
        p_tour: WELCOME_PERSONALIZATION_TOUR_KEY,
        p_version: WELCOME_PERSONALIZATION_VERSION,
        p_status: "completed",
      });
      expect(rpcMock).toHaveBeenCalledWith("set_onboarding_state", {
        p_tour: APP_ONBOARDING_TOUR_KEY,
        p_version: APP_ONBOARDING_VERSION,
        p_status: "completed",
      });
      expect(replaceMock).toHaveBeenCalledWith("/browse");
    });
  });

  it("lets a user unselect a starter item before finishing", async () => {
    render(<WelcomeActivation nextUrl="/browse" items={items} preview />);

    await userEvent.click(
      screen.getByRole("button", { name: "Psychology & the Brain" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Business & Strategy" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Wealth & Investing" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: /build your starter shelf/i }),
    );

    const itemButton = await screen.findByRole("button", {
      name: /save the psychology of money to your library/i,
    });
    await userEvent.click(itemButton);
    expect(
      screen.getByRole("button", {
        name: /remove the psychology of money from your library/i,
      }),
    ).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(
      screen.getByRole("button", {
        name: /remove the psychology of money from your library/i,
      }),
    );
    expect(
      screen.getByRole("button", {
        name: /save the psychology of money to your library/i,
      }),
    ).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("0/3 saved")).toBeInTheDocument();
  });

  it("keeps the user on welcome when activation cannot be saved", async () => {
    rpcMock.mockResolvedValue({ error: new Error("Database unavailable") });
    render(<WelcomeActivation nextUrl="/browse" items={items} />);

    await userEvent.click(
      screen.getByRole("button", { name: "Psychology & the Brain" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Business & Strategy" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Wealth & Investing" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: /build your starter shelf/i }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: /skip for now/i }),
    );

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith(
        "We couldn't save your progress. Please try again.",
      );
    });
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("uses local-only saves and completion in preview mode", async () => {
    render(<WelcomeActivation nextUrl="/browse" items={items} preview />);

    await userEvent.click(
      screen.getByRole("button", { name: "Psychology & the Brain" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Business & Strategy" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Wealth & Investing" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: /build your starter shelf/i }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: /skip for now/i }),
    );

    expect(rpcMock).not.toHaveBeenCalled();
    expect(replaceMock).not.toHaveBeenCalled();
    expect(toastSuccessMock).toHaveBeenCalledWith(
      "Preview complete. No changes were saved.",
    );
  });
});
