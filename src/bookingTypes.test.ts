import {
  Reservation,
  isHiddenForViewer,
  reservationRemoveKind,
} from './bookingTypes';

function make(overrides: Partial<Reservation> = {}): Reservation {
  return {
    id: 'r1',
    customerName: 'Deb',
    court: 'Court 1',
    date: '2026-10-01',
    hours: [9],
    players: 4,
    notes: '',
    isPaid: false,
    createdAt: 0,
    createdBy: 'player-1',
    paymentProofs: [],
    status: 'pending',
    hiddenByPlayer: false,
    hiddenByOwner: false,
    ...overrides,
  };
}

describe('reservationRemoveKind', () => {
  it('cancels (deletes) unpaid and pending reservations', () => {
    expect(reservationRemoveKind(make())).toBe('cancel');
    expect(reservationRemoveKind(make({ status: 'approved' }))).toBe('cancel');
  });

  it('removes a paid reservation (the app\'s current behaviour)', () => {
    expect(reservationRemoveKind(make({ status: 'approved', isPaid: true }))).toBe('remove');
  });

  it('clears a declined request', () => {
    expect(reservationRemoveKind(make({ status: 'declined' }))).toBe('clear');
  });
});

describe('isHiddenForViewer', () => {
  const paid = make({ status: 'approved', isPaid: true });

  it('hides a player-cleared row from that player only', () => {
    const r = { ...paid, hiddenByPlayer: true };
    expect(isHiddenForViewer(r, { isOwner: false, userId: 'player-1' })).toBe(true);
    // the owner still sees it
    expect(isHiddenForViewer(r, { isOwner: true, userId: 'owner-1' })).toBe(false);
    // and another player never has it hidden
    expect(isHiddenForViewer(r, { isOwner: false, userId: 'player-2' })).toBe(false);
  });

  it('hides an owner-cleared row from the owner only', () => {
    const r = { ...paid, hiddenByOwner: true };
    expect(isHiddenForViewer(r, { isOwner: true, userId: 'owner-1' })).toBe(true);
    expect(isHiddenForViewer(r, { isOwner: false, userId: 'player-1' })).toBe(false);
  });
});
