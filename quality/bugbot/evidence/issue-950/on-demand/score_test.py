"""Qualification isolation for BBE950-D03. No model calls or fixture reads."""
import unittest

from score import PLAN, summarize


class QualificationTest(unittest.TestCase):
    def test_c13_each_profile_requires_its_own_held_out_signal(self):
        rows = []
        for model in PLAN["models"]:
            for arm in PLAN["arms"]:
                for subject in ("R1", "R2"):
                    for repetition in PLAN["repetitions"]:
                        correct = arm == "on-demand"
                        cited = correct and (model == "gpt-6-luna" or repetition != 2)
                        rows.append({"model": model, "arm": arm, "subject": subject,
                                     "correct": correct, "cited": cited, "budgetProved": True})
        by_profile = summarize(rows)
        self.assertTrue(by_profile["gpt-6-luna"]["eligibleForFullReviewDiagnostic"])
        self.assertFalse(by_profile["gpt-6.1-sol"]["eligibleForFullReviewDiagnostic"])
        self.assertNotIn("productionQualified", by_profile["gpt-6-luna"])


if __name__ == "__main__":
    unittest.main()
