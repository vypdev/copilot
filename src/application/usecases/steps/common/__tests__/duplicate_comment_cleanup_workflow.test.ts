import { cleanupDuplicateComment } from '../duplicate_comment_cleanup_workflow';

const context = {
  issueNumber: 7,
  duplicateCommentId: 12,
  compactBody: 'Superseded. See the current status.',
};

function ports(removal: 'removed' | 'compaction-required' = 'removed') {
  return {
    removeComment: jest.fn().mockResolvedValue(removal),
    updateComment: jest.fn().mockResolvedValue(undefined),
  };
}

describe('duplicate comment cleanup workflow', () => {
  it('removes a duplicate when the provider supports deletion', async () => {
    const comments = ports();

    await expect(cleanupDuplicateComment(context, comments)).resolves.toBe('removed');

    expect(comments.removeComment).toHaveBeenCalledWith(7, 12);
    expect(comments.updateComment).not.toHaveBeenCalled();
  });

  it('compacts a duplicate only when deletion is forbidden', async () => {
    const comments = ports('compaction-required');

    await expect(cleanupDuplicateComment(context, comments)).resolves.toBe('compacted');

    expect(comments.updateComment).toHaveBeenCalledWith(7, 12, context.compactBody);
  });

  it('checks source freshness before each attempted mutation', async () => {
    const comments = ports('compaction-required');
    const sourceIsCurrent = jest.fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    await expect(cleanupDuplicateComment(context, comments, sourceIsCurrent)).resolves.toBe('stale');

    expect(sourceIsCurrent).toHaveBeenCalledTimes(2);
    expect(comments.removeComment).toHaveBeenCalledTimes(1);
    expect(comments.updateComment).not.toHaveBeenCalled();
  });

  it('does nothing when the source is stale before deletion', async () => {
    const comments = ports();

    await expect(cleanupDuplicateComment(
      context,
      comments,
      jest.fn().mockResolvedValue(false),
    )).resolves.toBe('stale');

    expect(comments.removeComment).not.toHaveBeenCalled();
    expect(comments.updateComment).not.toHaveBeenCalled();
  });

  it('propagates unexpected removal failures without attempting compaction', async () => {
    const comments = ports();
    comments.removeComment.mockRejectedValue(new Error('provider unavailable'));

    await expect(cleanupDuplicateComment(context, comments)).rejects.toThrow('provider unavailable');
    expect(comments.updateComment).not.toHaveBeenCalled();
  });
});
