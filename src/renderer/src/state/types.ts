// Single place that touches shared contract types; adjust here if shared moves.
import type { Account, ViewInfo, ViewState } from '../../../shared/account';

export type { Account, ViewInfo, ViewState };
export type AccountColor = Account['color'];
