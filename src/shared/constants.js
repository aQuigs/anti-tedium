export const ENTRY_TYPES = {
  INPUT_AND_BUTTON: 'input_and_button',
  BUTTON_ONLY: 'button_only',
  STRATEGY_ONLY: 'strategy_only',
};

export const STRATEGIES = {
  FILL_NO_CLICK: 'fill_no_click',
  CLICK_ONLY: 'click_only',
};

export const SCHEMA_VERSION = 1;

export const DEFAULT_SETTINGS = {
  enabled: true,
  defaultDelay: 300,
};

export const DEFAULT_EXECUTION = {
  delayBeforeAction: 500,
  delayBetweenActions: 200,
  waitForElement: true,
  waitTimeout: 5000,
};
