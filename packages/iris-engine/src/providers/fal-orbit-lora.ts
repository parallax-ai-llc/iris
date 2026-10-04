/**
 * MiniMax H3 360 Orbit LoRA on fal (`minimax/h3/image-to-video/lora`).
 *
 * One photo becomes a frozen-time 360 degree camera orbit. The scene is held
 * at one instant and only the camera moves; the same image is pinned as the
 * first and the last keyframe, so the clip closes on its own first frame.
 *
 * Source: community LoRA `pablodawson/MiniMax-H3-360-Orbit-LoRA`
 * (`minimax_h3_flf2v_lora_v1.safetensors`, published 2026-09-27), trained on
 * 28 human Gaussian-splat orbits at 768x768 / 73 frames. The weights URL is
 * pinned to a commit so a later push to the repo cannot change what we run.
 *
 * License: minimax-h3-community-license-agreement (the MiniMax H3 base
 * license). fal lists the endpoint as commercial-use, but the base license
 * excludes some territories and asks for "MiniMax H3" to be shown in the UI
 * of commercial products. Check the license terms before shipping widely.
 *
 * Every request uses the author's fixed trigger prompt verbatim (the LoRA was
 * trained on that single caption). The user's own text is not sent, and
 * fal's prompt rewriter is disabled so it cannot paraphrase the trigger.
 */

/** Catalog `model` string for this preset (unique picker key). */
export const FAL_ORBIT_LORA_MODEL_ID = 'minimax-h3-360-orbit';

/** fal queue endpoint. */
export const FAL_ORBIT_LORA_ENDPOINT = 'minimax/h3/image-to-video/lora';

/** LoRA weights, pinned to commit 5ddbc2d of the Hugging Face repo. */
export const FAL_ORBIT_LORA_WEIGHTS_URL =
  'https://huggingface.co/pablodawson/MiniMax-H3-360-Orbit-LoRA/resolve/5ddbc2dbbe95edbbdaf5017c3e934b1d01791697/minimax_h3_flf2v_lora_v1.safetensors';

/** Trigger prompt from the model card, to be used verbatim. */
export const FAL_ORBIT_LORA_TRIGGER_PROMPT =
  'One frozen instant. Only the camera moves. In a continuous 360 orbit. ' +
  'Preserve every person and object in exactly the same world position, ' +
  'orientation, shape and pose throughout the shot. Airborne objects remain ' +
  'suspended at the captured height and angle: no wobbling, shaking, ' +
  'spinning, drifting, falling or continued action. Keep faces, hands, ' +
  'clothing, liquids and the background motionless while retaining their ' +
  'natural appearance. Camera parallax is the only source of apparent ' +
  'movement. No cuts, zoom, morphing or added objects.';

/** 768P is the native mode closest to the LoRA's 768x768 training clips. */
export const FAL_ORBIT_LORA_RESOLUTION = '768P';

/** fal bills this endpoint per second: $0.075/s at 768P. */
export const FAL_ORBIT_LORA_COST_PER_SECOND = 0.075;

/**
 * fal accepts integer seconds 5..15 (default 5). The LoRA's training clips
 * were about 3 seconds, so the shortest allowed length is the default.
 */
export const FAL_ORBIT_LORA_MIN_DURATION = 5;
export const FAL_ORBIT_LORA_MAX_DURATION = 15;

/**
 * The duration actually sent to fal. Hosts price with this same function so
 * the amount charged always matches the seconds fal bills.
 */
export function resolveOrbitLoraDuration(requested?: unknown): number {
  const n = typeof requested === 'number' ? requested : Number(requested);
  if (!Number.isFinite(n)) return FAL_ORBIT_LORA_MIN_DURATION;
  return Math.min(
    FAL_ORBIT_LORA_MAX_DURATION,
    Math.max(FAL_ORBIT_LORA_MIN_DURATION, Math.round(n))
  );
}

/** Request body for the fal endpoint. `imageUrl` is the start AND end frame. */
export function buildOrbitLoraInput(
  imageUrl: string,
  parameters: Record<string, unknown>
): Record<string, unknown> {
  const input: Record<string, unknown> = {
    prompt: FAL_ORBIT_LORA_TRIGGER_PROMPT,
    image_url: imageUrl,
    end_image_url: imageUrl,
    loras: [{ path: FAL_ORBIT_LORA_WEIGHTS_URL, scale: 1 }],
    duration: resolveOrbitLoraDuration(parameters.duration),
    resolution: FAL_ORBIT_LORA_RESOLUTION,
    prompt_expansion_mode: 'disabled',
    enable_safety_checker: true,
  };
  if (typeof parameters.seed === 'number') {
    input.seed = parameters.seed;
  }
  return input;
}
