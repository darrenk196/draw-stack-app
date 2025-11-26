import { toast as sonnerToast } from 'svelte-sonner';

export const toast = {
  success: (message: string) => {
    sonnerToast.success(message);
  },
  
  error: (message: string) => {
    sonnerToast.error(message);
  },
  
  warning: (message: string) => {
    sonnerToast.warning(message);
  },
  
  info: (message: string) => {
    sonnerToast.info(message);
  },
  
  promise: <T>(
    promise: Promise<T>,
    messages: {
      loading: string;
      success: string;
      error: string;
    }
  ) => {
    return sonnerToast.promise(promise, messages);
  }
};
