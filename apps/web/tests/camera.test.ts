// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cameraController } from '../src/local/camera'

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })
function media(getUserMedia: ReturnType<typeof vi.fn>) {
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } })
  const stop = vi.fn()
  const stream = { getTracks: () => [{ stop }] } as unknown as MediaStream
  const video = { srcObject: null, play: vi.fn(async () => undefined) } as unknown as HTMLVideoElement
  return { stop, stream, video }
}
describe('camera lifecycle', () => {
  it('stops a late permission result after leaving the camera', async () => {
    let grant!: (stream: MediaStream) => void
    const getUserMedia = vi.fn(() => new Promise<MediaStream>(resolve => { grant = resolve }))
    const { stream, stop, video } = media(getUserMedia)
    const controller = cameraController(video)
    expect(getUserMedia).not.toHaveBeenCalled()
    const pending = controller.start('environment')
    controller.stop(); grant(stream)
    await expect(pending).rejects.toThrow('cancelled')
    expect(stop).toHaveBeenCalledOnce()
    expect(video.srcObject).toBeNull()
    expect(video.play).not.toHaveBeenCalled()
  })
  it('releases tracks if the preview cannot play', async () => {
    const getUserMedia = vi.fn()
    const { stream, stop, video } = media(getUserMedia)
    getUserMedia.mockResolvedValue(stream)
    vi.mocked(video.play).mockRejectedValue(new DOMException('Denied', 'NotAllowedError'))
    await expect(cameraController(video).start('user')).rejects.toThrow('Denied')
    expect(stop).toHaveBeenCalledOnce()
    expect(video.srcObject).toBeNull()
    expect(getUserMedia.mock.calls[0]![0].audio).toBe(false)
  })
})
