import pretty from 'pino-pretty';
import type { PrettyOptions } from 'pino-pretty';
import type { LogDescriptor } from 'pino';

interface CustomLogDescriptor extends LogDescriptor {
  module?: string;
}

type MessageFormatFunc = (log: CustomLogDescriptor, messageKey: string) => string;

const transport = (opts: PrettyOptions) => {
  return pretty({
    ...opts,
    messageFormat: ((
      log: CustomLogDescriptor,
      messageKey: string
    ) => {
      return `[${log.module}] - ${log[messageKey]}`;
    }) as MessageFormatFunc,
  });
};

export default transport;
