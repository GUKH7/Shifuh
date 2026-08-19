# Domain modules

The application route tree is responsible for routing, layouts and route-specific loading states. Business UI and stateful workflows live under `src/features`.

## Settings

`src/features/settings` owns the settings workspace, settings types, constants and helpers. The `/admin/settings` page is a thin adapter that exports the feature workspace.

## Orders

`src/features/orders` owns the live order workspace, order types, formatting helpers, responsive workspace styles and WhatsApp status used by the order route. The route only composes layout concerns.

## Storefront

`src/features/storefront/StorefrontPage.tsx` owns the interactive storefront shell. Catalog-specific UI and navigation live under `src/features/storefront/catalog`. Server data, store summary, cart and storefront state remain in the storefront domain.

## Checkout

`src/features/checkout` owns checkout rendering, delivery-address calculation, payment-method loading, checkout formatting and checkout analytics. Compatibility re-exports remain temporarily under `src/features/storefront` so existing imports can migrate without a flag day.

## Rules

- New route pages should stay thin and delegate to a feature domain.
- New checkout code should import from `@/features/checkout`.
- New catalog code should import from `@/features/storefront/catalog`.
- Compatibility re-exports are transitional boundaries, not places for new implementation.
- Split code by responsibility and lifecycle; do not create micro-components solely to reduce line count.
