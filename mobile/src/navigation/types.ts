/**
 * Route names and their parameters, in one place.
 *
 * Each tab owns a stack rather than the app owning one big stack: pushing a
 * business profile inside the Search tab means switching to Chat and back
 * returns you to the profile you were reading, which is what a phone user
 * expects and what a single shared stack cannot do.
 */

import type { NavigatorScreenParams } from "@react-navigation/native";

/** A listing is addressed by slug, exactly as it is on the web. */
export interface BusinessRouteParams {
  slug: string;
  /** Shown in the header while the detail request is still in flight. */
  name?: string;
}

export type HomeStackParamList = {
  Home: undefined;
  Business: BusinessRouteParams;
};

export type SearchStackParamList = {
  Search:
    | {
        q?: string;
        category_slug?: string;
        /** Ask for the device's location as soon as the screen opens. */
        nearMe?: boolean;
      }
    | undefined;
  Business: BusinessRouteParams;
};

export type ChatStackParamList = {
  Conversations: undefined;
  Thread: { conversationId: number; title: string };
};

export type AccountStackParamList = {
  Account: undefined;
  /** `reason` explains why the screen appeared, when something sent you here. */
  Login: { reason?: string } | undefined;
};

export type OwnerStackParamList = {
  Listings: undefined;
  Leads: { businessId: number; name: string };
};

export type RootTabParamList = {
  HomeTab: NavigatorScreenParams<HomeStackParamList>;
  SearchTab: NavigatorScreenParams<SearchStackParamList>;
  ChatTab: NavigatorScreenParams<ChatStackParamList>;
  /** Only mounted for a business_owner - see RootNavigator. */
  BusinessTab: NavigatorScreenParams<OwnerStackParamList>;
  AccountTab: NavigatorScreenParams<AccountStackParamList>;
};
