#include <stdlib.h>
#include <stdint.h>
#include <ebur128.h>
#include <emscripten/emscripten.h>

static ebur128_state *st = NULL;

EMSCRIPTEN_KEEPALIVE
int eb_init(int channels, int samplerate) {
    if (st) {
        ebur128_destroy(&st);
        st = NULL;
    }
    st = ebur128_init(channels, samplerate);
    return st != NULL;
}

EMSCRIPTEN_KEEPALIVE
int eb_add_samples(float *buf, int frames) {
    if (!st || !buf || frames <= 0) return 0;
    return ebur128_add_frames_float(st, buf, (size_t)frames);
}

EMSCRIPTEN_KEEPALIVE
double eb_get_i_loudness() {
    if (!st) return 0.0;
    double loudness = 0.0;
    if (ebur128_loudness_global(st, &loudness) == EBUR128_SUCCESS) return loudness;
    return 0.0;
}

EMSCRIPTEN_KEEPALIVE
void eb_reset() {
    if (st) {
        ebur128_destroy(&st);
        st = NULL;
    }
}
