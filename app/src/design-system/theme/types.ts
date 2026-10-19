export type CardVariant = 'standard' | 'attention';

export type PersonalOSTheme = {
  readonly isDark: boolean;
  readonly colours: {
    readonly background: string;
    readonly navigationSurface: string;
    readonly cardStandard: string;
    readonly cardAttention: string;
    readonly textPrimary: string;
    readonly textSecondary: string;
    readonly textSecondaryOnSurface: string;
    readonly action: string;
    readonly borderSubtle: string;
    readonly borderControl: string;
  };
};
