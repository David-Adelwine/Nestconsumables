import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserContext, hasRole } from "@/lib/auth/get-user-context";

type ConsumeResult = {
  movement_id: string;
  remaining_quantity: number | string;
};

function getErrorStatus(message: string): number {
  if (message === "INSUFFICIENT_STOCK") return 409;
  if (message === "STOCK_BALANCE_NOT_FOUND") return 404;

  if (
    message === "NEST_OR_TEAM_ACCESS_REQUIRED" ||
    message === "QUARTERMASTER_ACCESS_REQUIRED"
  ) {
    return 403;
  }

  if (
    message === "INVALID_INPUT" ||
    message === "ITEM_NOT_FOUND_OR_INACTIVE"
  ) {
    return 400;
  }

  if (
    message === "NOT_AUTHENTICATED" ||
    message === "ACCOUNT_INACTIVE"
  ) {
    return 401;
  }

  return 500;
}

export async function POST(request: Request) {
  try {
    const user = await getUserContext();

    if (!user?.isActive || !user.hasApplicationAccess) {
      return NextResponse.json(
        { error: "Please sign in with an active application account." },
        { status: 401 },
      );
    }

    if (
      !hasRole(user, "quartermaster") &&
      !hasRole(user, "it_admin")
    ) {
      return NextResponse.json(
        { error: "You do not have Quartermaster access." },
        { status: 403 },
      );
    }

    const body = (await request.json()) as {
      nestId?: unknown;
      itemId?: unknown;
      quantity?: unknown;
      note?: unknown;
    };

    const nestId = Number(body.nestId);
    const itemId = String(body.itemId ?? "").trim();
    const quantity = Number(body.quantity);
    const note = String(body.note ?? "").trim();

    if (!Number.isSafeInteger(nestId) || nestId <= 0) {
      return NextResponse.json(
        { error: "Select a valid nest." },
        { status: 400 },
      );
    }

    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        itemId,
      );

    if (!isUuid) {
      return NextResponse.json(
        { error: "Select a valid item." },
        { status: 400 },
      );
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      return NextResponse.json(
        { error: "Enter a consumption quantity greater than zero." },
        { status: 400 },
      );
    }

    if (note.length > 500) {
      return NextResponse.json(
        { error: "The note must be 500 characters or fewer." },
        { status: 400 },
      );
    }

    const supabase = await createClient();

    const { data, error } = await supabase.rpc("consume_stock", {
      p_nest_id: nestId,
      p_item_id: itemId,
      p_quantity: quantity,
      p_note: note || null,
    });

    if (error) {
      const status = getErrorStatus(error.message);

      if (status === 500) {
        console.error("Stock consumption failed:", error);
      }

      const messages: Record<string, string> = {
        INSUFFICIENT_STOCK:
          "The consumption quantity exceeds available stock.",
        STOCK_BALANCE_NOT_FOUND:
          "There is no stock balance for this item at this nest.",
        NEST_OR_TEAM_ACCESS_REQUIRED:
          "You do not have access to this item at this nest.",
        QUARTERMASTER_ACCESS_REQUIRED:
          "You do not have Quartermaster access.",
        INVALID_INPUT:
          "Enter a valid item, nest, and quantity.",
        ITEM_NOT_FOUND_OR_INACTIVE:
          "This item is unavailable.",
        NOT_AUTHENTICATED:
          "Please sign in again.",
        ACCOUNT_INACTIVE:
          "Your application account is inactive.",
      };

      return NextResponse.json(
        {
          error:
            messages[error.message] ??
            "Unable to record item consumption.",
        },
        { status },
      );
    }

    const results = (data ?? []) as unknown as ConsumeResult[];
    const result = results[0];

    if (!result) {
      return NextResponse.json(
        { error: "Consumption was not recorded." },
        { status: 500 },
      );
    }

    return NextResponse.json({
      movementId: result.movement_id,
      remainingQuantity: Number(result.remaining_quantity),
    });
  } catch (error) {
    console.error("Stock consumption route failed:", error);

    return NextResponse.json(
      { error: "Unable to record item consumption." },
      { status: 500 },
    );
  }
}