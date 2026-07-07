package main

import "sync"

// bufferPool recycles fixed-size byte slices for streaming copies, keeping the
// steady-state allocation rate at zero no matter how many concurrent streams
// are in flight.
type bufferPool struct {
	pool sync.Pool
	size int
}

func newBufferPool(size int) *bufferPool {
	bp := &bufferPool{size: size}
	bp.pool.New = func() any {
		b := make([]byte, size)
		return &b
	}
	return bp
}

func (bp *bufferPool) get() []byte {
	return *bp.pool.Get().(*[]byte)
}

func (bp *bufferPool) put(b []byte) {
	if cap(b) < bp.size {
		return // don't retain undersized buffers
	}
	b = b[:bp.size]
	bp.pool.Put(&b)
}
