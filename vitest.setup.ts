import '@testing-library/jest-dom';

// Глобальные моки для тестирования
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};
