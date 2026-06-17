/**
 * Quick Filter
 * Apply quick image filters: grayscale, invert, sepia.
 */

export function activate(context: IrisExtensionContext) {
  // Grayscale filter
  context.subscriptions.push(
    iris.commands.register('iris-official.quick-filter.grayscale', async () => {
      const image = await iris.image.getActive();
      if (!image) {
        await iris.window.showMessage('No active image found.', 'warn');
        return;
      }

      const { width, height, data } = image;
      const result = new Uint8Array(data.length);

      for (let i = 0; i < data.length; i += 4) {
        const gray = Math.round(
          data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114
        );
        result[i] = gray;
        result[i + 1] = gray;
        result[i + 2] = gray;
        result[i + 3] = data[i + 3];
      }

      await iris.image.putImage({ width, height, data: result });
      await iris.window.showMessage('Grayscale filter applied.', 'info');
    })
  );

  // Invert filter
  context.subscriptions.push(
    iris.commands.register('iris-official.quick-filter.invert', async () => {
      const image = await iris.image.getActive();
      if (!image) {
        await iris.window.showMessage('No active image found.', 'warn');
        return;
      }

      const { width, height, data } = image;
      const result = new Uint8Array(data.length);

      for (let i = 0; i < data.length; i += 4) {
        result[i] = 255 - data[i];
        result[i + 1] = 255 - data[i + 1];
        result[i + 2] = 255 - data[i + 2];
        result[i + 3] = data[i + 3];
      }

      await iris.image.putImage({ width, height, data: result });
      await iris.window.showMessage('Invert filter applied.', 'info');
    })
  );

  // Sepia filter
  context.subscriptions.push(
    iris.commands.register('iris-official.quick-filter.sepia', async () => {
      const image = await iris.image.getActive();
      if (!image) {
        await iris.window.showMessage('No active image found.', 'warn');
        return;
      }

      const { width, height, data } = image;
      const result = new Uint8Array(data.length);

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        result[i] = Math.min(255, Math.round(r * 0.393 + g * 0.769 + b * 0.189));
        result[i + 1] = Math.min(255, Math.round(r * 0.349 + g * 0.686 + b * 0.168));
        result[i + 2] = Math.min(255, Math.round(r * 0.272 + g * 0.534 + b * 0.131));
        result[i + 3] = data[i + 3];
      }

      await iris.image.putImage({ width, height, data: result });
      await iris.window.showMessage('Sepia filter applied.', 'info');
    })
  );

  iris.log.info('Quick Filter activated');
}

export function deactivate() {}
